/** What a page shows when the browser's storage cannot be read: a message and a way to try again. */
export function showLoadError(app: HTMLElement, retry: () => void): void {
  const box = document.createElement('div')
  box.setAttribute('role', 'alert')
  box.style.cssText = 'padding:24px 4px;display:flex;flex-direction:column;gap:12px;align-items:flex-start'
  const msg = document.createElement('div')
  msg.textContent = 'Contextia could not read its settings from the browser. Your data is not lost; the browser storage did not answer.'
  const btn = document.createElement('button')
  btn.className = 'cx-primary'
  btn.textContent = 'Try again'
  btn.addEventListener('click', retry)
  box.append(msg, btn)
  app.replaceChildren(box)
}
