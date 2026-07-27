"""Regression tests for the citation/reference-fabrication filter in server.py.

Unlike the other files in this directory, these are pure unit tests against
server.py's filter functions directly (plus one light integration check) — no
running server or live Anthropic API required. That's deliberate: the whole
point of _filter_references_block is to catch a rare, non-deterministic failure
mode (the model fabricating or dropping a citation) that a live-LLM test can't
reliably trigger on demand. These tests pin down the exact filtering behavior —
including several specific bugs found and fixed during development — so a
future change to this code can't silently reintroduce fabricated citations.

Run with: cd backend && python -m pytest tests/test_reference_filter.py -v
"""
import asyncio
import os
import sys

os.environ.setdefault("ANTHROPIC_API_KEY", "sk-ant-test-not-real")
os.environ.setdefault("TAVILY_API_KEY", "tvly-test-not-real")
os.environ.setdefault("RESEND_API_KEY", "re_test_not_real")
os.environ.setdefault("SENDER_EMAIL", "hello@example.com")
os.environ.pop("MONGO_URL", None)
os.environ.pop("DB_NAME", None)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server

FACTS = (
    "- The AVMA recommends annual wellness exams for adult dogs. "
    "(Source: https://www.avma.org/resources/pet-owners)\n"
    "- Cats sleep 12-16 hours a day on average. "
    "(Source: https://www.aspca.org/animal-cruelty/cat-care)"
)


class TestExtractDomains:
    def test_pulls_domain_from_full_url(self):
        assert "avma.org" in server._extract_domains(FACTS)

    def test_strips_leading_www(self):
        domains = server._extract_domains("Source: https://www.example.com/page")
        assert "example.com" in domains
        assert "www.example.com" not in domains

    def test_finds_bare_domain_without_protocol(self):
        assert "thesprucepets.com" in server._extract_domains("See thesprucepets.com for more.")

    def test_empty_or_missing_text_returns_empty_set(self):
        assert server._extract_domains("") == set()
        assert server._extract_domains(None) == set()


class TestDomainMatches:
    def test_exact_match(self):
        assert server._domain_matches("avma.org", "avma.org")

    def test_subdomain_of_allowed_domain_matches(self):
        assert server._domain_matches("en.wikipedia.org", "wikipedia.org")

    def test_allowed_domain_as_subdomain_of_cited_also_matches(self):
        assert server._domain_matches("wikipedia.org", "en.wikipedia.org")

    def test_unrelated_domains_do_not_match(self):
        assert not server._domain_matches("example.com", "example.org")

    def test_lookalike_substring_is_not_treated_as_a_subdomain(self):
        # "notavma.org" contains "avma.org" as a raw character substring but is a
        # different, unrelated domain — must not match.
        assert not server._domain_matches("notavma.org", "avma.org")


class TestFilterReferencesBlock:
    def test_strips_a_fabricated_source_not_present_in_facts(self):
        """The original bug: the model named a real-sounding organization that was
        never in Facts to Use. This is the core case the filter exists for."""
        text = (
            "- American Veterinary Medical Association (avma.org) — pet wellness guidance.\n"
            "- Fabricated Pet Wellness Institute (petwellnessinstitute.org) — made up source.\n"
        )
        result = server._filter_references_block(text, FACTS)
        assert "avma.org" in result.lower()
        assert "petwellnessinstitute" not in result.lower()

    def test_keeps_every_genuinely_cited_source(self):
        text = (
            "- AVMA (avma.org) — wellness exams.\n"
            "- ASPCA (aspca.org) — cat sleep habits.\n"
        )
        result = server._filter_references_block(text, FACTS)
        assert "avma.org" in result.lower()
        assert "aspca.org" in result.lower()

    def test_no_facts_provided_empties_the_whole_block(self):
        """Nothing can be verified with zero facts, so nothing ships — never a
        plausible-sounding but unverifiable citation list."""
        text = "- Some Organization (example.com) — a claim.\n"
        assert server._filter_references_block(text, "") == ""

    def test_empty_input_text_passes_through_untouched(self):
        assert server._filter_references_block("", FACTS) == ""
        assert server._filter_references_block(None, FACTS) == ""

    def test_numbered_list_formatting_is_still_validated(self):
        """Regression: the filter used to only inspect lines starting with '-' or
        '*', so a numbered-list response bypassed domain validation entirely."""
        text = (
            "1. Fabricated Vet Institute (fakevetinstitute.org) - a made up source.\n"
            "2. ASPCA (aspca.org) - real source.\n"
        )
        result = server._filter_references_block(text, FACTS)
        assert "fakevetinstitute" not in result.lower()
        assert "aspca.org" in result.lower()

    def test_subdomain_in_facts_matches_a_bare_domain_citation(self):
        """Regression: a fact sourced from a subdomain (en.wikipedia.org) failed to
        match a citation of the bare registrable domain (wikipedia.org)."""
        facts = "- Info from Wikipedia. (Source: https://en.wikipedia.org/wiki/Cat)"
        text = "- Wikipedia (wikipedia.org) — general reference.\n"
        result = server._filter_references_block(text, facts)
        assert "wikipedia.org" in result.lower()

    def test_short_allowed_domain_does_not_false_match_inside_unrelated_domain(self):
        """Regression: an unanchored substring check let a short allowed domain
        (bit.ly) spuriously match inside an unrelated fabricated domain
        (rabbit.lycos.com), letting a fabricated citation through."""
        facts = "- Shortened link. (Source: https://bit.ly/abc123)"
        text = "- Rabbit Network (rabbit.lycos.com) — a made up source.\n"
        result = server._filter_references_block(text, facts)
        assert "rabbit.lycos.com" not in result.lower()

    def test_domain_matching_is_case_insensitive(self):
        facts = "- Info. (Source: https://www.AVMA.org/pets)"
        text = "- AVMA (avma.org) — pet wellness.\n"
        result = server._filter_references_block(text, facts)
        assert "avma.org" in result.lower()

    def test_domain_with_trailing_path_still_matches(self):
        facts = "- (Source: https://www.akc.org/expert-advice/)"
        text = "- American Kennel Club (akc.org/expert-advice) — breed info.\n"
        result = server._filter_references_block(text, facts)
        assert "akc.org" in result.lower()


class TestSourcesBlockToFacts:
    """The import-time counterpart: an imported article's references/resources
    block needs to seed factsToUse, or the filter above has nothing to check
    future regenerations against and strips even genuinely-sourced citations."""

    def test_source_with_a_url_is_preserved(self):
        content = "- Cornell Feline Health Center — vet-reviewed research. (https://www2.vet.cornell.edu/fhc)"
        result = server._sources_block_to_facts(content)
        assert "vet.cornell.edu" in result
        assert "NEEDS A URL" not in result

    def test_source_with_only_a_name_is_flagged_not_dropped(self):
        content = "- PetMD, covers cat behavior and health basics."
        result = server._sources_block_to_facts(content)
        assert "PetMD" in result
        assert "NEEDS A URL" in result

    def test_flagged_source_does_not_grant_a_domain_on_regenerate(self):
        """A flagged name-only source must not let the model's own later guess at
        that organization's domain slip through as if it had been verified."""
        content = "- PetMD, covers cat behavior and health basics."
        facts = server._sources_block_to_facts(content)
        regenerated = "- PetMD (petmd.com) — cat behavior and health basics.\n"
        result = server._filter_references_block(regenerated, facts)
        assert "petmd.com" not in result.lower()


def _run(coro):
    return asyncio.run(coro)


class TestGenerateBlockRouteAppliesFilter:
    """Confirms the /generate/block route actually calls the filter for
    blockType == "references" — protects against a future refactor quietly
    dropping that call while leaving the filter function itself intact."""

    def test_references_block_is_filtered_through_the_route(self, monkeypatch):
        async def fake_llm_complete(system, user_text, max_tokens=2000):
            return (
                "- AVMA (avma.org) — real, cited source.\n"
                "- Fabricated Org (fabricated-not-in-facts.org) — should be stripped.\n"
            )
        monkeypatch.setattr(server, "llm_complete", fake_llm_complete)

        class FakeBrief:
            factsToUse = FACTS
            def model_dump(self):
                return {"factsToUse": FACTS, "topic": "test", "niche": "General",
                        "audience": "", "angle": "", "keyPoints": "", "focusKeyword": "",
                        "categories": [], "extra": ""}

        class FakeBody:
            styleId = "real-person"
            blockType = "references"
            blockNote = ""
            targetLength = "medium"
            styleInstructions = ""
            priorContent = ""
            brief = FakeBrief()

        result = _run(server.generate_block(FakeBody()))
        text = result["text"].lower()
        assert "avma.org" in text
        assert "fabricated-not-in-facts" not in text

    def test_non_references_block_is_not_run_through_the_filter(self, monkeypatch):
        """Sanity check that the filter is references-specific — a paragraph block
        that happens to mention a domain not in facts should pass through untouched."""
        async def fake_llm_complete(system, user_text, max_tokens=2000):
            return "Cats are wonderful pets, as noted on totally-unrelated-domain.com."
        monkeypatch.setattr(server, "llm_complete", fake_llm_complete)

        class FakeBrief:
            factsToUse = ""
            def model_dump(self):
                return {"factsToUse": "", "topic": "test", "niche": "General",
                        "audience": "", "angle": "", "keyPoints": "", "focusKeyword": "",
                        "categories": [], "extra": ""}

        class FakeBody:
            styleId = "real-person"
            blockType = "paragraph"
            blockNote = ""
            targetLength = "medium"
            styleInstructions = ""
            priorContent = ""
            brief = FakeBrief()

        result = _run(server.generate_block(FakeBody()))
        assert "totally-unrelated-domain.com" in result["text"]
