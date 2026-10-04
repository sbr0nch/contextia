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

describe('scoreSendButton, signal by signal', () => {
  it('adds up the signals it documents', () => {
    expect(scoreSendButton(el('<button data-testid="Send-Button"></button>'))).toBe(4) // matched in lower case
    expect(scoreSendButton(el('<button type="submit"></button>'))).toBe(3)
    expect(scoreSendButton(el('<button aria-label="Send message"></button>'))).toBe(3)
    expect(scoreSendButton(el('<button title="Submit"></button>'))).toBe(3) // title counts like aria-label
    expect(scoreSendButton(el('<button aria-label="enviar"></button>'))).toBe(3)
    expect(scoreSendButton(el('<button><svg></svg></button>'))).toBe(1) // an icon alone
    expect(scoreSendButton(el('<button><svg></svg> Attach</button>'))).toBe(0) // an icon with a text label is not the lone-icon signal
    expect(scoreSendButton(el('<button data-testid="send" type="submit" aria-label="Send"><svg></svg></button>'))).toBe(11)
  })
  it('does not mistake a word that merely contains send for the send word', () => {
    expect(scoreSendButton(el('<button aria-label="Resend code"></button>'))).toBe(0)
    expect(scoreSendButton(el('<button aria-label="Sender settings"></button>'))).toBe(0)
  })
  it('is a send target from a score of 3, and not from 2', () => {
    expect(isSendTarget(el('<button type="submit"></button>'))).toBe(true)
    expect(isSendTarget(el('<div role="button" aria-label="Send"></div>'))).toBe(true)
    expect(isSendTarget(el('<button><svg></svg></button>'))).toBe(false)
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
