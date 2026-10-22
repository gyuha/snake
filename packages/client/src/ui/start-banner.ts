/** Plays the CSS `banner` animation (fast fade in, hold, fade out over 1.5 s) from the start, even if it is mid-play. */
export function playStartBanner(el: HTMLElement): void {
  el.classList.remove('play');
  void el.offsetWidth; // reflow so re-adding the class restarts the animation
  el.classList.add('play');
}
