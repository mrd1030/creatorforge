/* eslint-disable */
// Loose typing bridge for shadcn .jsx components used from .tsx files.
// Explicit per-module declarations are deterministic across incremental builds
// (the wildcard fallback alone is flaky under fork-ts-checker).

declare module "@/components/ui/*" {
  const C: any;
  export = C;
}

declare module "@/components/ui/button" {
  export const Button: any;
  export const buttonVariants: any;
}
declare module "@/components/ui/sonner" {
  export const Toaster: any;
}
declare module "@/components/ui/input" {
  export const Input: any;
}
declare module "@/components/ui/label" {
  export const Label: any;
}
declare module "@/components/ui/textarea" {
  export const Textarea: any;
}
declare module "@/components/ui/badge" {
  export const Badge: any;
  export const badgeVariants: any;
}
declare module "@/components/ui/switch" {
  export const Switch: any;
}
declare module "@/components/ui/separator" {
  export const Separator: any;
}
declare module "@/components/ui/card" {
  export const Card: any;
  export const CardHeader: any;
  export const CardFooter: any;
  export const CardTitle: any;
  export const CardDescription: any;
  export const CardContent: any;
}
declare module "@/components/ui/tabs" {
  export const Tabs: any;
  export const TabsList: any;
  export const TabsTrigger: any;
  export const TabsContent: any;
}
declare module "@/components/ui/select" {
  export const Select: any;
  export const SelectGroup: any;
  export const SelectValue: any;
  export const SelectTrigger: any;
  export const SelectContent: any;
  export const SelectLabel: any;
  export const SelectItem: any;
  export const SelectSeparator: any;
  export const SelectScrollUpButton: any;
  export const SelectScrollDownButton: any;
}
declare module "@/components/ui/dialog" {
  export const Dialog: any;
  export const DialogPortal: any;
  export const DialogOverlay: any;
  export const DialogTrigger: any;
  export const DialogClose: any;
  export const DialogContent: any;
  export const DialogHeader: any;
  export const DialogFooter: any;
  export const DialogTitle: any;
  export const DialogDescription: any;
}
declare module "@/components/ui/alert-dialog" {
  export const AlertDialog: any;
  export const AlertDialogPortal: any;
  export const AlertDialogOverlay: any;
  export const AlertDialogTrigger: any;
  export const AlertDialogContent: any;
  export const AlertDialogHeader: any;
  export const AlertDialogFooter: any;
  export const AlertDialogTitle: any;
  export const AlertDialogDescription: any;
  export const AlertDialogAction: any;
  export const AlertDialogCancel: any;
}
