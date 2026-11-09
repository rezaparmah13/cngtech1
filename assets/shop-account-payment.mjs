import { mountPaymentStart } from './shop-payment-view.mjs';

/** Only used by the private authenticated account lifecycle. DOM data is not
 * authorization: the server rechecks every start. No fetch occurs on mount. */
export function mountAccountPayment(root, options = {}) {
  const revision = root?.dataset?.revision;
  if (typeof revision !== 'string' || !/^[1-9][0-9]{0,8}(?![\s\S])/.test(revision)) {
    throw new Error('invalid_payment_revision');
  }
  return mountPaymentStart(root, {
    ...options,
    csrf: root.dataset.csrf,
    reference: root.dataset.reference,
    revision: Number(revision),
  });
}
