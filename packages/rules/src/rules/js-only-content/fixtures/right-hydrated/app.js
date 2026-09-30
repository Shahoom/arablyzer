/* global document */
// Draws the page's text again once it loads, as an app that hydrates the server's HTML does.
const app = document.getElementById('app')
const texts = [...app.querySelectorAll('h1, p')].map((element) => [element.localName, element.textContent])
app.replaceChildren(
  ...texts.map(([name, text]) => {
    const element = document.createElement(name)
    element.textContent = text
    return element
  }),
)
