/**
 * Code lists for hreflang (Google: ISO 639-1 language, optional ISO 15924 script, optional
 * ISO 3166-1 alpha-2 region). Generated on 2026-09-24 from the IANA Language Subtag Registry,
 * File-Date 2025-08-25 (npm language-subtag-registry 0.4.2):
 * - languages: every two-letter language subtag, deprecated ones included (iw, in, ji…), 190 codes;
 * - scripts: every four-letter script subtag, without the private-use range Qaaa..Qabx, 224 codes;
 * - regions: the 249 officially assigned ISO 3166-1 alpha-2 codes, the two-letter region subtags
 *   that are neither deprecated, private use nor exceptionally reserved (EU, UN, AC…), checked
 *   against npm i18n-iso-countries 7.14.0 (whose extra XK is a user-assigned code, not ISO).
 */
const words = (list: string) => new Set(list.toLowerCase().split(' '))

export const ISO_639_1_LANGUAGES = words(
  'aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co cr cs cu cv cy ' +
    'da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi ho hr ht hu ' +
    'hy hz ia id ie ig ii ik in io is it iu iw ja ji jv jw ka kg ki kj kk kl km kn ko kr ks ku kv ' +
    'kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mo mr ms mt my na nb nd ne ng nl nn no nr ' +
    'nv ny oc oj om or os pa pi pl ps pt qu rm rn ro ru rw sa sc sd se sg sh si sk sl sm sn so sq ' +
    'sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi ' +
    'yo za zh zu',
)

export const ISO_15924_SCRIPTS = words(
  'Adlm Afak Aghb Ahom Arab Aran Armi Armn Avst Bali Bamu Bass Batk Beng Berf Bhks Blis Bopo Brah ' +
    'Brai Bugi Buhd Cakm Cans Cari Cham Cher Chis Chrs Cirt Copt Cpmn Cprt Cyrl Cyrs Deva Diak Dogr ' +
    'Dsrt Dupl Egyd Egyh Egyp Elba Elym Ethi Gara Geok Geor Glag Gong Gonm Goth Gran Grek Gujr Gukh ' +
    'Guru Hanb Hang Hani Hano Hans Hant Hatr Hebr Hira Hluw Hmng Hmnp Hntl Hrkt Hung Inds Ital Jamo ' +
    'Java Jpan Jurc Kali Kana Kawi Khar Khmr Khoj Kitl Kits Knda Kore Kpel Krai Kthi Lana Laoo Latf ' +
    'Latg Latn Leke Lepc Limb Lina Linb Lisu Loma Lyci Lydi Mahj Maka Mand Mani Marc Maya Medf Mend ' +
    'Merc Mero Mlym Modi Mong Moon Mroo Mtei Mult Mymr Nagm Nand Narb Nbat Newa Nkdb Nkgb Nkoo Nshu ' +
    'Ogam Olck Onao Orkh Orya Osge Osma Ougr Palm Pauc Pcun Pelm Perm Phag Phli Phlp Phlv Phnx Piqd ' +
    'Plrd Prti Psin Ranj Rjng Rohg Roro Runr Samr Sara Sarb Saur Seal Sgnw Shaw Shrd Shui Sidd Sidt ' +
    'Sind Sinh Sogd Sogo Sora Soyo Sund Sunu Sylo Syrc Syre Syrj Syrn Tagb Takr Tale Talu Taml Tang ' +
    'Tavt Tayo Telu Teng Tfng Tglg Thaa Thai Tibt Tirh Tnsa Todr Tols Toto Tutg Ugar Vaii Visp Vith ' +
    'Wara Wcho Wole Xpeo Xsux Yezi Yiii Zanb Zinh Zmth Zsye Zsym Zxxx Zyyy Zzzz',
)

export const ISO_3166_1_REGIONS = words(
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR ' +
    'BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ ' +
    'EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW ' +
    'GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY ' +
    'KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV ' +
    'MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
    'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG ' +
    'TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ' +
    'ZW',
)
