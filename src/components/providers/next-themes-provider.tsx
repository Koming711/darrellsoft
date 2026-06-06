"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProviderImpl } from "next-themes"

export function NextThemesProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProviderImpl>) {
  return <NextThemesProviderImpl {...props}>{children}</NextThemesProviderImpl>
}
