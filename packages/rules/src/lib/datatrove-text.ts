/**
 * The character sets of datatrove's text utilities, copied from
 * https://github.com/huggingface/datatrove/blob/1977fbb0f3c163d43cace334b073dda17fa3ef26/src/datatrove/utils/text.py
 * (commit 1977fbb0f3c1, 2026-09-30): `PUNCTUATION` (lines 13-18, with the control characters its
 * `join` adds) and `TERMINAL_PUNCTUATION` (lines 19-180). Used by the FineWeb-2 filters in
 * ai-training.ts.
 */
export const PUNCTUATION =
  '!/—”:％１〈&(、━\u{5c}【#%「」，】；+^]~“《„\u{27};’{|∶´[=-`*．（–？！：$～«〉,><》)?）。…@_."}►»\u{0}\u{1}\u{2}\u{3}\u{4}\u{5}\u{6}\u{7}\u{8}\u{b}\u{c}\u{d}\u{e}\u{f}\u{10}\u{11}\u{12}\u{13}\u{14}\u{15}\u{16}\u{17}\u{18}\u{19}\u{1a}\u{1b}\u{1c}\u{1d}\u{1e}\u{1f}\u{7f}\u{80}\u{81}\u{82}\u{83}\u{84}\u{85}\u{86}\u{87}\u{88}\u{89}\u{8a}\u{8b}\u{8c}\u{8d}\u{8e}\u{8f}\u{90}\u{91}\u{92}\u{93}\u{94}\u{95}\u{96}\u{97}\u{98}\u{99}\u{9a}\u{9b}\u{9c}\u{9d}\u{9e}\u{9f}'
export const TERMINAL_PUNCTUATION =
  '!.?։؝؞؟۔܀܁܂߹࠷࠹࠽࠾।॥၊။።፧፨᙮᜵᜶។៕៖៙៚᠃᠉᥄᥅᪨᪩᪪᪫᭚᭛᭞᭟᭽᭾᰻᰼᱾᱿‼‽⁇⁈⁉⸮⸼⹓⹔。꓿꘎꘏꛳꛷꡶꡷꣎꣏꤯꧈꧉꩝꩞꩟꫰꫱꯫﹒﹖﹗！．？｡\u{10a56}\u{10a57}\u{10f55}\u{10f56}\u{10f57}\u{10f58}\u{10f59}\u{10f86}\u{10f87}\u{10f88}\u{10f89}\u{11047}\u{11048}\u{110be}\u{110bf}\u{110c0}\u{110c1}\u{11141}\u{11142}\u{11143}\u{111c5}\u{111c6}\u{111cd}\u{111de}\u{111df}\u{11238}\u{11239}\u{1123b}\u{1123c}\u{112a9}\u{1144b}\u{1144c}\u{115c2}\u{115c3}\u{115c9}\u{115ca}\u{115cb}\u{115cc}\u{115cd}\u{115ce}\u{115cf}\u{115d0}\u{115d1}\u{115d2}\u{115d3}\u{115d4}\u{115d5}\u{115d6}\u{115d7}\u{11641}\u{11642}\u{1173c}\u{1173d}\u{1173e}\u{11944}\u{11946}\u{11a42}\u{11a43}\u{11a9b}\u{11a9c}\u{11c41}\u{11c42}\u{11ef7}\u{11ef8}\u{11f43}\u{11f44}\u{16a6e}\u{16a6f}\u{16af5}\u{16b37}\u{16b38}\u{16b44}\u{16e98}\u{1bc9f}\u{1da88}'
