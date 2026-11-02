export const diagnosticsEnabled =
  import.meta.env.DEV ||
  (typeof navigator !== 'undefined' && navigator.webdriver === true)
