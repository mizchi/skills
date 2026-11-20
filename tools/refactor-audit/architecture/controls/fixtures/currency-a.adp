Runtime cycle orders -> payments -> orders. All cross-package imports for these edges:
orders/checkout.ts:2 import {charge} from 'payments'; export function checkout(order) { return charge(order.total) }
payments/charge.ts:3 import {currencyDecimals} from 'orders/display'
payments/charge.ts:9 export function charge(total) { return gateway.pay(toMinor(total, currencyDecimals[total.unit])) }
orders/display.ts:1 export const currencyDecimals = { USD:2, JPY:0 } as const
orders/display.ts:5 export function display(total) { return format(total, currencyDecimals[total.unit]) }
