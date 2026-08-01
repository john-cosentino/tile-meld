// The three contract viewports of the arcade rebuild (same trio the
// tabletop layout contract and prior capture scripts use).
export const CONTRACT_VIEWPORTS = [
  { name: "desktop-1440x900", width: 1440, height: 900 },
  { name: "phone-portrait-390x844", width: 390, height: 844 },
  { name: "phone-landscape-844x390", width: 844, height: 390 },
] as const;

export type ContractViewport = (typeof CONTRACT_VIEWPORTS)[number];
