// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { scoreSendButton, isSendTarget } from '../src/send-button.js'

function el(html: string): HTMLElement {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.firstElementChild as HTMLElement
}

describe('scoreSendButton', () => {
  it('scores by independent signals so a redesign cannot break all at once', () => {
    expect(scoreSendButton(el('<button data-testid="send-button"></button>'))).toBeGreaterThanOrEqual(4)
    expect(scoreSendButton(el('<button type="submit">x</button>'))).toBeGreaterThanOrEqual(3)
    expect(scoreSendButton(el('<button aria-label="Invia messaggio"></button>'))).toBeGreaterThanOrEqual(3)
    expect(scoreSendButton(el('<button aria-label="Send message"></button>'))).toBeGreaterThanOrEqual(3)
  })
  it('does not over-match a plain or unrelated button', () => {
    expect(scoreSendButton(el('<button>Cancel</button>'))).toBe(0)
    expect(scoreSendButton(el('<button aria-label="Attach files"><svg></svg></button>'))).toBe(1)
  })
})

describe('isSendTarget', () => {
  it('matches a click on or inside a send button, not elsewhere', () => {
    const send = el('<button data-testid="send-button"><svg></svg></button>')
    expect(isSendTarget(send)).toBe(true)
    expect(isSendTarget(send.querySelector('svg'))).toBe(true) // closest() climbs to the button
    expect(isSendTarget(el('<button>Attach</button>'))).toBe(false)
    expect(isSendTarget(null)).toBe(false)
  })
})
