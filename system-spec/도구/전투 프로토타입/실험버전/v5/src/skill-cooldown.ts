/** Clockwise segments, starting at twelve o'clock. Gameplay owns cooldown timing. */
export function skillCooldownGauge(total: number, remaining: number): string {
  const count = Math.max(0, Math.floor(total))
  if (!count) return ''
  const filled = count - Math.min(count, Math.max(0, Math.ceil(remaining)))
  const sweep = 360 / count
  const gap = Math.min(7, sweep * .14)
  const point = (degrees: number) => {
    const radians = (degrees - 90) * Math.PI / 180
    return `${50 + 46 * Math.cos(radians)} ${50 + 46 * Math.sin(radians)}`
  }
  const arcs = Array.from({ length: count }, (_, index) => {
    const start = index * sweep + gap / 2
    const end = (index + 1) * sweep - gap / 2
    return `<path class="cooldown-segment ${index < filled ? 'filled' : ''}" d="M ${point(start)} A 46 46 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)}"/>`
  }).join('')
  return `<svg class="skill-cooldown-gauge ${filled === count ? 'charged' : ''}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${arcs}</svg>`
}
