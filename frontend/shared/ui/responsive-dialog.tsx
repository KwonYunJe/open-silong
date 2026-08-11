"use client";

import * as React from "react";
import { X } from "lucide-react";

// NOTE: switch threshold is `md` (768px) per the project's existing
// useIsMobile hook. Replace with your own breakpoint hook if you need
// a different desktop cutover (e.g. lg / xl).
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { cn } from "@/shared/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/shared/ui/drawer-lazy";

/**
 * Responsive dialog primitive.
 *
 * Desktop: Dialog modal klasik, centred, scrim gelap.
 * Mobile: Drawer bottom-sheet (vaul) — lebih PWA-friendly,
 * handle swipe-down-to-dismiss, respek safe-area inset.
 */

type Mode = "dialog" | "drawer";

const ResponsiveDialogContext = React.createContext<Mode>("dialog");

function useResponsiveMode(): Mode {
  return React.useContext(ResponsiveDialogContext);
}

// ponytail: only the two sizes in use are modelled — add a key here
// (and to the union) when a caller genuinely needs a wider dialog.
export type ResponsiveDialogSize = "sm" | "lg";

const SIZE_CLASSES: Record<ResponsiveDialogSize, string> = {
  sm: "sm:max-w-sm",
  lg: "sm:max-w-lg",
};

export interface ResponsiveDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  children,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();
  const mode: Mode = isMobile ? "drawer" : "dialog";
  const Root = mode === "dialog" ? Dialog : Drawer;

  const rootTree = (
    <Root open={open} onOpenChange={onOpenChange}>
      {children}
    </Root>
  );

  return (
    <ResponsiveDialogContext.Provider value={mode}>
      {/* Drawer primitives are lazy (vaul is code-split out of first-load);
          Suspense catches the chunk fetch. Closed drawer renders nothing,
          so fallback null is visually identical to the closed state. */}
      {mode === "drawer" ? (
        <React.Suspense fallback={null}>{rootTree}</React.Suspense>
      ) : (
        rootTree
      )}
    </ResponsiveDialogContext.Provider>
  );
}

export interface ResponsiveDialogContentProps
  extends React.ComponentProps<typeof DialogContent> {
  size?: ResponsiveDialogSize;
  drawerClassName?: string;
}

export function ResponsiveDialogContent({
  size = "lg",
  className,
  drawerClassName,
  children,
  ...props
}: ResponsiveDialogContentProps) {
  const mode = useResponsiveMode();

  if (mode === "dialog") {
    return (
      <DialogContent
        className={cn(
          "flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto",
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {children}
      </DialogContent>
    );
  }

  // Mobile (drawer mode).
  return (
    <DrawerContent
      className={cn("max-h-[92dvh]", drawerClassName)}
      {...(props as React.ComponentProps<typeof DrawerContent>)}
    >
      <DrawerClose
        aria-label="Tutup"
        className="absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <X className="h-4 w-4" />
      </DrawerClose>
      <div className="flex w-full flex-col gap-4 overflow-y-auto px-4 pb-4">
        {children}
      </div>
    </DrawerContent>
  );
}

export function ResponsiveDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const mode = useResponsiveMode();
  const Header = mode === "dialog" ? DialogHeader : DrawerHeader;
  return <Header className={cn(className)} {...props} />;
}

export function ResponsiveDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const mode = useResponsiveMode();
  const Footer = mode === "dialog" ? DialogFooter : DrawerFooter;
  return <Footer className={cn(className)} {...props} />;
}

export function ResponsiveDialogTitle(
  // `key` is consumed by React and never reaches the component, but React
  // 19.2.8 widened `React.Key` while Radix/vaul still declare
  // `key?: string | number | bigint` — spreading the union no longer
  // typechecks. Omitting it is also just correct: key is not a prop.
  props: Omit<React.ComponentProps<typeof DialogTitle>, "key">,
) {
  const mode = useResponsiveMode();
  const Title = mode === "dialog" ? DialogTitle : DrawerTitle;
  return <Title {...props} />;
}

export function ResponsiveDialogDescription(
  props: Omit<React.ComponentProps<typeof DialogDescription>, "key">,
) {
  const mode = useResponsiveMode();
  const Description = mode === "dialog" ? DialogDescription : DrawerDescription;
  return <Description {...props} />;
}

export { useResponsiveMode };
