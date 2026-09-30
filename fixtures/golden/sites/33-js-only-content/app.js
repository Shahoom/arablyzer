/* global document */
// Writes the page's text after it loads, as an app that renders in the browser does.
const app = document.getElementById('app')
for (const text of [
  'قهوة عربية محمّصة تحميصاً خفيفاً ومطحونة مع الهيل، في علب تُشحن خلال يومين.',
  'تُحضَّر في الدلة على نار هادئة، وتُقدَّم مع التمر في فناجين صغيرة.',
  'الطلب من ثلاث علب فأكثر يُشحن مجاناً إلى كل مدن السلطنة.',
]) {
  const paragraph = document.createElement('p')
  paragraph.textContent = text
  app.append(paragraph)
}
