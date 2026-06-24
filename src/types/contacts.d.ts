/**
 * Contact Picker API type declarations
 * Spec: https://developer.mozilla.org/en-US/docs/Web/API/Contact_Picker_API
 *
 * Supported on:
 * - Android Chrome
 * - Safari iOS 14.5+
 * Requires HTTPS + user gesture (click). Not supported on desktop browsers.
 */

interface ContactAddress {
  country?: string
  addressLine?: string[]
  region?: string
  city?: string
  dependentLocality?: string
  postalCode?: string
  sortingCode?: string
  organization?: string
  recipient?: string
  phone?: string
}

interface Contact {
  address?: ContactAddress[]
  email?: string[]
  icon?: Blob[]
  name?: string[]
  tel?: string[]
}

interface ContactsSelectOptions {
  multiple?: boolean
}

interface ContactsManager {
  select(properties: ('address' | 'email' | 'icon' | 'name' | 'tel')[], options?: ContactsSelectOptions): Promise<Contact[]>
  getProperties(): Promise<('address' | 'email' | 'icon' | 'name' | 'tel')[]>
}

interface Navigator {
  readonly contacts?: ContactsManager
}
