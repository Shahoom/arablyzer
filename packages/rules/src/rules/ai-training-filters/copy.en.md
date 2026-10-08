# The page's text does not pass the AI training quality filters

## Messages

### repetition

The page's text is more repeated than the Gopher repetition filter allows: the measure {check} reached {measured} where the limit is {threshold} ({count} repetition measures failed).

### line-endings

Few lines of the page end in punctuation: the share is {measured} and the minimum is {threshold}. Text that is mostly headings and lists without sentences counts as low quality.

### repeated-lines

Repeated lines make up {measured} of the page's characters, where the limit is {threshold}.

### list-like

The page is lists and short lines more than running text: lines per word are {measured} and the limit is {threshold}.

### word-length

The average word is {measured} letters long, outside the range the filter accepts (measure {check}, limit {threshold}).

### symbols

The page has more symbols, bullet points or ellipses than the filter accepts (measure {check}: {measured}, limit {threshold}).

### alpha

The share of words with at least one letter is {measured} and the minimum is {threshold}: most of the text is numbers and symbols.

### stop-words

We found {measured} of the common Arabic words the filter wants at least two of ({threshold}): the text does not read as connected Arabic sentences.

### length

The page has a number of words ({measured}) outside what the filter accepts ({threshold}).

## Why it matters

- **Models learn from filtered text.** The public FineWeb-2 corpus, which many models are trained on, drops a page that fails its quality filters before a model sees it. A page that is dropped is not part of what the model learns.
- **Repetition drops a page more than anything else**: the same paragraph on every page, lists of links, or repeated footer text.
- **Text that is good for people is good for machines**: whole sentences with full stops and punctuation, common Arabic words, and lines that mean something.

## How to fix

- Write paragraphs of whole sentences that end in a full stop, and have fewer headings and short lists with no explanation.
- Do not repeat the same paragraph on a page or on every page of the site; move shared text to one page.
- Do not stuff the page with lists of links or runs of keywords.
- Keep numbers and symbols next to text that explains them.

## How we detect

1. We take the visible text of an Arabic page without the navigation, header and footer, a line for each block, and run the filters of FineWeb-2's Arabic (`arb_Arab`) configuration in its order: Gopher repetition, FineWeb quality, then Gopher quality.
2. The thresholds are the values published in `configs/arb_Arab.yml` of [huggingface/fineweb-2](https://github.com/huggingface/fineweb-2/blob/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/configs/arb_Arab.yml) (commit d0defb24f193), and what that file does not name comes from the defaults of the [datatrove](https://github.com/huggingface/datatrove/tree/1977fbb0f3c163d43cace334b073dda17fa3ef26/src/datatrove/pipeline/filters) library (commit 1977fbb0f3c1). We invented no number.
3. FineWeb-2 identifies language with the GlotLID model (fastText), which cannot run here, so we estimate it as the share of the text's letters that are Arabic, held to the same 0.711 threshold, and show it as information rather than a verdict. That estimate cannot tell Arabic from Persian or Urdu. The C4 filters are not in the FineWeb-2 pipeline, so they are shown as a reference, not a verdict.
4. Words are split the way spaCy's Arabic tokenizer does, approximately: a run of letters and digits, and each mark by itself. The text here is the page's visible text, not Trafilatura's output.
5. Each kind of measure that failed is reported once, with the first and the number that failed. The rule needs 50 words, as the pipeline does. It is a minor finding.

## References

- [FineWeb-2: the processing pipeline](https://github.com/huggingface/fineweb-2/blob/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/fineweb-2-pipeline.py)
- [FineWeb-2: the Arabic thresholds](https://github.com/huggingface/fineweb-2/blob/d0defb24f193bb9a5a11b8b14524a03c4858e1b6/configs/arb_Arab.yml)
- [Rae et al.: Scaling Language Models (Gopher)](https://arxiv.org/abs/2112.11446)
