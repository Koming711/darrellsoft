"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { XIcon, GripHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

// Drag context to share drag handler between DialogContent and DialogHeader
const DragContext = React.createContext<{
  handleMouseDown: (e: React.MouseEvent) => void
  isDragging: boolean
}>({ handleMouseDown: () => {}, isDragging: false })

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)
  const [hasDragged, setHasDragged] = React.useState(false)
  const dragOffset = React.useRef({ x: 0, y: 0 })

  // Check if children contain a DialogTitle for accessibility
  const hasTitle = React.useMemo(() => {
    let found = false
    React.Children.forEach(children, (child) => {
      if (React.isValidElement(child)) {
        // Check direct child
        if (
          (child.type as any)?.displayName === 'DialogTitle' ||
          (child.type as any)?.name === 'DialogTitle' ||
          (child.type as any)?.toString?.().includes('DialogTitle')
        ) {
          found = true
        }
        // Check children of DialogHeader
        if ((child.type as any)?.displayName === 'DialogHeader' || (child.type as any)?.name === 'DialogHeader') {
          React.Children.forEach(child.props?.children, (subChild: React.ReactNode) => {
            if (
              React.isValidElement(subChild) &&
              ((subChild.type as any)?.displayName === 'DialogTitle' ||
                (subChild.type as any)?.name === 'DialogTitle' ||
                (subChild.type as any)?.toString?.().includes('DialogTitle'))
            ) {
              found = true
            }
          })
        }
      }
    })
    return found
  }, [children])

  const handleMouseDown = React.useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking interactive elements
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="button"]')) return
    e.preventDefault()
    setIsDragging(true)
    if (!hasDragged) {
      // First drag: calculate offset from current centered position
      if (contentRef.current) {
        const rect = contentRef.current.getBoundingClientRect()
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      }
    } else {
      dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    }
  }, [hasDragged, pos])

  React.useEffect(() => {
    if (!isDragging) return
    const handleMove = (e: MouseEvent) => {
      const newX = e.clientX - dragOffset.current.x
      const newY = e.clientY - dragOffset.current.y
      setPos({ x: newX, y: newY })
      setHasDragged(true)
    }
    const handleUp = () => setIsDragging(false)
    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
    return () => {
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  // Reset position when dialog closes and reopens
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    // Small delay to allow the open animation to complete
    const timer = setTimeout(() => {
      setHasDragged(false)
      setPos({ x: 0, y: 0 })
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const dragContextValue = React.useMemo(() => ({
    handleMouseDown,
    isDragging
  }), [handleMouseDown, isDragging])

  // If the dialog has been dragged, use absolute positioning
  // Otherwise, use the default centered positioning from Radix
  const dragStyle: React.CSSProperties = hasDragged
    ? { position: 'fixed', left: pos.x, top: pos.y, transform: 'none' }
    : {}

  return (
    <DragContext.Provider value={dragContextValue}>
      <DialogPortal data-slot="dialog-portal">
        <DialogOverlay />
        <DialogPrimitive.Content
          ref={contentRef}
          data-slot="dialog-content"
          aria-label={props['aria-label'] || 'Dialog'}
          className={cn(
            "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
            isDragging && "cursor-grabbing select-none",
            hasDragged && "transition-none",
            className
          )}
          style={dragStyle}
          {...props}
        >
          {/* Fallback VisuallyHidden title for accessibility if no DialogTitle is provided */}
          {!hasTitle && (
            <DialogPrimitive.Title className="sr-only">
              Dialog
            </DialogPrimitive.Title>
          )}
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DragContext.Provider>
  )
}

function DialogHeader({ className, children, ...props }: React.ComponentProps<"div">) {
  const { handleMouseDown, isDragging } = React.useContext(DragContext)

  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 sm:text-left cursor-grab active:cursor-grabbing select-none",
        isDragging && "cursor-grabbing",
        className
      )}
      onMouseDown={handleMouseDown}
      {...props}
    >
      {/* Drag indicator */}
      <div className="flex items-center justify-center -mt-1 mb-1">
        <GripHorizontal className="w-5 h-3 text-muted-foreground/40" />
      </div>
      {children}
    </div>
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  const { handleMouseDown, isDragging } = React.useContext(DragContext)

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-lg leading-none font-semibold cursor-grab active:cursor-grabbing select-none",
        isDragging && "cursor-grabbing",
        className
      )}
      onMouseDown={handleMouseDown}
      {...props}
    />
  )
}
DialogTitle.displayName = 'DialogTitle'

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
