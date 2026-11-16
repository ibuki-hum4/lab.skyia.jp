// URL の :id を読む(routes.ts からも読むので、ほかの import はしない)

/** 数字だけ(BigInt にする)。違えば null */
export function parseId(value: string | undefined): bigint | null {
    return value && /^\d{1,18}$/.test(value) ? BigInt(value) : null;
}
