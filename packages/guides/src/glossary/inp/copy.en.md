# Interaction to Next Paint (INP)

INP measures responsiveness: how long a page takes to show a response after a tap, click or key press. Good is 200 milliseconds or less; poor is over 500.

## Definition

- Interaction to Next Paint observes the latency of every click, tap and key press during a visit, and reports the longest, leaving out outliers: on pages with many interactions, it ignores the slowest one for every 50.
- An interaction’s latency runs from the input to the next frame the browser paints, in three parts: the input delay before the event handlers start, the time they take to run, and the presentation delay until the frame is shown.
- Hovering, scrolling and zooming do not count, and a visit with no click, tap or key press has no INP.
- Good is 200 milliseconds or less and poor is more than 500, at the 75th percentile of page loads, on phones and desktops separately. INP replaced First Input Delay (FID), which measured only the input delay of the first interaction.

## Why it matters

- It is the responsiveness metric of the Core Web Vitals, which Google’s ranking systems use.
- It covers the whole visit, not just the first tap: a slow menu or add-to-cart button counts even late in the visit.
- It needs real visitors: lab tools such as Lighthouse load the page without a user, so they cannot measure it; web.dev suggests Total Blocking Time (TBT) as its stand-in in the lab.

## Example

A click handler that shows its change first and leaves the rest until after the next frame, as web.dev suggests:

```js
button.addEventListener('click', () => {
  // The visible change first, so the next frame paints it.
  button.textContent = 'Added to cart';
  // The rest after that frame.
  requestAnimationFrame(() => {
    setTimeout(() => {
      updateCartTotal();
      sendAnalytics();
    }, 0);
  });
});
```

## Common mistakes

- Long tasks on the main thread, such as large scripts parsed and run while the page loads: the browser cannot answer a tap until they end. Break the work up.
- Event handlers that finish all their work before the screen changes.
- A very large DOM, which makes every update slower to render.

## References

- [web.dev: Interaction to Next Paint (INP)](https://web.dev/articles/inp)
- [web.dev: Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp)
