import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'
import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const ContextMenu = ContextMenuPrimitive.Root
export const ContextMenuTrigger = ContextMenuPrimitive.Trigger

export const ContextMenuContent = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Portal>
    <ContextMenuPrimitive.Content ref={ref} className={cn('ui-menu-content', className)} {...props} />
  </ContextMenuPrimitive.Portal>
))
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

export const ContextMenuItem = forwardRef<
  ElementRef<typeof ContextMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Item ref={ref} className={cn('ui-menu-item', className)} {...props} />
))
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName
