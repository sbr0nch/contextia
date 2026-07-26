// Resilient, selector-agnostic send-button detection: combine several weak
// signals so a site redesign (renamed testid, moved button) doesn't break it.
export const SEND_HINT = /\b(send|submit)\b|invia|enviar|senden|envoyer|送信|发送|보내기/i

export function scoreSendButton(b: Element): number {
  let s = 0
  const testid = (b.getAttribute('data-testid') ?? '').toLowerCase()
  const aria = `${b.getAttribute('aria-label') ?? ''} ${b.getAttribute('title') ?? ''}`.toLowerCase()
  if (testid.includes('send')) s += 4
  if (b.getAttribute('type') === 'submit') s += 3 // explicit attr: a bare <button> defaults to submit
  if (SEND_HINT.test(aria)) s += 3
  if (b.querySelector('svg') && !(b.textContent ?? '').trim()) s += 1
  return s
}

export function isSendTarget(target: EventTarget | null): boolean {
  const b = target instanceof Element ? target.closest('button, [role="button"]') : null
  return !!b && scoreSendButton(b) >= 3
}
