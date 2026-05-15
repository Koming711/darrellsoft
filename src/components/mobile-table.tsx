'use client'

import { useState, useEffect } from 'react'
import { ChevronRight, Check, Pencil, Trash2, Eye } from 'lucide-react'
import { TableDropdownMenu, TableActionsHeader } from './table-dropdown-menu'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: string
  title: string
  render?: (item: T) => React.ReactNode
  className?: string
}

interface MobileTableProps<T> {
  data: T[]
  columns: Column<T>[]
  keyField: keyof T
  onEdit?: (item: T) => void
  onDelete?: (item: T) => void
  onView?: (item: T) => void
  onCopy?: (item: T) => void
  emptyMessage?: string
  emptyIcon?: React.ReactNode
  showAsButtons?: boolean
  extraActions?: (item: T) => React.ReactNode
  mobileCardActions?: (item: T) => React.ReactNode
}

export function MobileTable<T extends Record<string, any>>({
  data,
  columns,
  keyField,
  onEdit,
  onDelete,
  onView,
  onCopy,
  emptyMessage = 'Tidak ada data',
  emptyIcon,
  showAsButtons = false,
  extraActions,
  mobileCardActions,
}: MobileTableProps<T>) {
  const [selectedItems, setSelectedItems] = useState<Set<any>>(new Set())
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const toggleSelection = (item: T) => {
    const key = item[keyField]
    const newSelection = new Set(selectedItems)
    if (newSelection.has(key)) {
      newSelection.delete(key)
    } else {
      newSelection.add(key)
    }
    setSelectedItems(newSelection)
  }

  const clearSelection = () => {
    setSelectedItems(new Set())
  }

  const getSelectedItems = () => {
    return data.filter(item => selectedItems.has(item[keyField]))
  }

  const handleEditSelected = () => {
    const items = getSelectedItems()
    if (items.length > 0 && onEdit) {
      onEdit(items[0]) // Edit first selected item
      clearSelection()
    }
  }

  const handleDeleteSelected = () => {
    const items = getSelectedItems()
    if (items.length > 0 && onDelete) {
      onDelete(items[0]) // Delete first selected item
      clearSelection()
    }
  }

  const handleViewSelected = () => {
    const items = getSelectedItems()
    if (items.length > 0 && onView) {
      onView(items[0]) // View first selected item
      clearSelection()
    }
  }

  const getFirstNonEmptyColumn = (item: T) => {
    for (const col of columns) {
      const value = col.render ? col.render(item) : item[col.key]
      if (value && typeof value === 'object' && 'props' in value) {
        // React element
        return col
      } else if (value !== null && value !== undefined && value !== '') {
        return col
      }
    }
    return columns[0]
  }

  if (data.length === 0) {
    return (
      <div className="p-8 lg:p-12 text-center">
        {emptyIcon || <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <ChevronRight className="w-6 h-6 text-slate-400" />
        </div>}
        <p className="text-sm text-slate-600">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <>
      {/* Mobile Selection Header */}
      {isMobile && selectedItems.size > 0 && (
        <TableActionsHeader
          selectedCount={selectedItems.size}
          onClearSelection={clearSelection}
          onEditSelected={onEdit ? handleEditSelected : undefined}
          onDeleteSelected={onDelete ? handleDeleteSelected : undefined}
          onViewSelected={onView ? handleViewSelected : undefined}
        />
      )}

      {/* Desktop Table */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap",
                    col.className
                  )}
                >
                  {col.title}
                </th>
              ))}
              <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
                Aksi
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.map((item, idx) => (
              <tr key={String(item[keyField]) || idx} className="hover:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-2.5 text-sm", col.className)}>
                    {col.render ? col.render(item) : (item[col.key] as React.ReactNode)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <TableDropdownMenu
                      onEdit={onEdit ? () => onEdit(item) : undefined}
                      onDelete={onDelete ? () => onDelete(item) : undefined}
                      onView={onView ? () => onView(item) : undefined}
                      onCopy={onCopy ? () => onCopy(item) : undefined}
                      showAsButtons={showAsButtons}
                    />
                    {extraActions && extraActions(item)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card List */}
      <div className="lg:hidden space-y-2">
        {data.map((item, idx) => {
          const isSelected = selectedItems.has(item[keyField])
          return (
            <div
              key={String(item[keyField]) || idx}
              onClick={() => isMobile && !mobileCardActions && toggleSelection(item)}
              className={cn(
                "bg-white border border-slate-200 rounded-lg p-3 transition-all",
                mobileCardActions ? "cursor-default" : "cursor-pointer",
                isSelected ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500 ring-offset-2" : "hover:border-slate-300"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Main title (first non-empty column) */}
                  {(() => {
                    const mainCol = getFirstNonEmptyColumn(item)
                    return (
                      <h3 className="font-medium text-sm text-slate-800 truncate mb-1">
                        {mainCol.render ? mainCol.render(item) : (item[mainCol.key] as React.ReactNode)}
                      </h3>
                    )
                  })()}

                  {/* Other columns as key-value pairs */}
                  <div className="space-y-0.5">
                    {columns.slice(1).map((col) => {
                      const value = col.render ? col.render(item) : (item[col.key] as React.ReactNode)
                      if (value === null || value === undefined || value === '') return null
                      return (
                        <div key={col.key} className="flex justify-between items-center">
                          <span className="text-xs text-slate-500">{col.title}</span>
                          <span className="text-xs font-medium text-slate-700 text-right">{value}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {isSelected ? (
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <ChevronRight className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
                )}
              </div>
              {/* Mobile card action buttons */}
              {mobileCardActions && mobileCardActions(item)}

              {/* Action buttons for mobile cards */}
              {(onEdit || onDelete || onView) && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
                  {onView && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onView(item) }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 active:bg-emerald-200 transition-all duration-150"
                    >
                      Lihat
                    </button>
                  )}
                  {onEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(item) }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 active:bg-blue-200 transition-all duration-150"
                    >
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(item) }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-md border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 active:scale-95 active:bg-red-200 transition-all duration-150"
                    >
                      Hapus
                    </button>
                  )}
                  {extraActions && extraActions(item)}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
