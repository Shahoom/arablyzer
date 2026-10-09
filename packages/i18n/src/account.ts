import type { AuthErrorCode } from '@arablyzer/api-contract/codes'
import type { Copy } from './copy'

/** What can go wrong in the sign-in and account pages: the API's codes, and the page's own. */
export type AccountProblem =
  | AuthErrorCode
  | 'network'
  /** Google did not vouch for the address (or gave none). */
  | 'unverified'
  /** The person closed Google's window or said no. */
  | 'cancelled'
  /** Anything else that ended a sign-in without an account. */
  | 'failed'

export interface AccountStrings {
  /** The header's link to the account page. */
  readonly link: string
  readonly login: {
    readonly title: string
    readonly lead: string
    /** The small print: what is kept, and what is not. */
    readonly keeps: string
    /** Under the Google button, while the page gets it ready. */
    readonly preparing: string
    /** Shown when Google's own button could not load, above ours. */
    readonly fallback: string
    /** Google's brand name for the button: "Sign in with Google", in its own words per language. */
    readonly google: string
    readonly working: string
    /** The page's title in the browser. */
    readonly pageTitle: string
    readonly pageDescription: string
  }
  readonly account: {
    readonly title: string
    readonly lead: string
    readonly email: string
    readonly name: string
    readonly language: string
    readonly languageHint: string
    readonly signOut: string
    readonly signOutEverywhere: string
    readonly signedOut: string
    readonly loading: string
    readonly pageTitle: string
    readonly pageDescription: string
    readonly unavailable: string
  }
  readonly delete: {
    readonly title: string
    readonly text: string
    readonly open: string
    readonly confirm: string
    readonly cancel: string
    readonly working: string
    /** The session is too old to erase an account: sign in again first. */
    readonly freshNeeded: string
    readonly signInAgain: string
    readonly done: string
    readonly doneDetail: string
  }
  readonly problems: Readonly<Record<AccountProblem, string>>
}

export const ACCOUNT_UI: Copy<AccountStrings> = {
  reviewed: false,
  ar: {
    link: 'حسابي',
    login: {
      title: 'تسجيل الدخول',
      lead: 'الدخول اختياري. الفحص يبقى مجانياً وبلا حساب. ندخلك بحساب Google، فلا توجد كلمة مرور تُنشئها أو تنساها.',
      keeps:
        'نحفظ بريدك واسمك واللغة التي تختارها، وكوكي واحداً يُبقيك مسجلاً للدخول. لا نحفظ كلمة مرور ولا صورة شخصية ولا أي شيء آخر من حساب Google. وتستطيع حذف حسابك في أي وقت.',
      preparing: 'نجهّز زر Google…',
      fallback: 'تعذّر تحميل زر Google هنا، فادخل من صفحة Google نفسها.',
      google: 'تسجيل الدخول باستخدام Google',
      working: 'ندخلك…',
      pageTitle: 'تسجيل الدخول — Arablyzer',
      pageDescription:
        'ادخل إلى حسابك في Arablyzer بحساب Google. الدخول اختياري، والفحص مجاني بلا حساب.',
    },
    account: {
      title: 'حسابك',
      lead: 'سجّلت الدخول بحساب Google.',
      email: 'البريد',
      name: 'الاسم',
      language: 'اللغة',
      languageHint: 'لغة حسابك.',
      signOut: 'تسجيل الخروج',
      signOutEverywhere: 'الخروج من كل الأجهزة',
      signedOut: 'سجّلت خروجك.',
      loading: 'نفتح حسابك…',
      pageTitle: 'حسابك — Arablyzer',
      pageDescription: 'حسابك في Arablyzer: بريدك ولغتك، والخروج وحذف الحساب.',
      unavailable: 'الحسابات غير مفعّلة في هذا الموقع. الفحص يعمل كالمعتاد بلا حساب.',
    },
    delete: {
      title: 'حذف الحساب',
      text: 'يمحو هذا حسابك وجلساتك والبريد والاسم اللذين حفظناهما، ولا يمكن التراجع عنه. التقارير التي أنشأتها بالفحص غير مرتبطة بحسابك وتبقى كما هي.',
      open: 'حذف الحساب…',
      confirm: 'احذف حسابي نهائياً',
      cancel: 'إلغاء',
      working: 'نحذف الحساب…',
      freshNeeded: 'لحمايتك، ادخل مرة أخرى قبل الحذف. لن يستغرق ذلك إلا لحظة.',
      signInAgain: 'الدخول من جديد',
      done: 'حُذف حسابك.',
      doneDetail: 'لم يبقَ عندنا شيء عنك.',
    },
    problems: {
      'bad-request': 'تعذّر قراءة الطلب. حدّث الصفحة وأعد المحاولة.',
      'rate-limited': 'محاولات كثيرة.',
      unauthorized: 'لم تسجّل الدخول.',
      'invalid-token': 'لم نقبل ردّ Google. أعد المحاولة.',
      'fresh-login-required': 'لحمايتك، ادخل مرة أخرى ثم أعد المحاولة.',
      'not-found': 'الحسابات غير مفعّلة في هذا الموقع.',
      unavailable: 'خدمة الحسابات غير متاحة الآن. أعد المحاولة بعد قليل.',
      network: 'لم نصل إلى الخدمة. تأكد من اتصالك وأعد المحاولة.',
      unverified: 'لم تؤكد Google بريدك الإلكتروني، فلا نستطيع إدخالك به.',
      cancelled: 'أُلغي تسجيل الدخول.',
      failed: 'لم يكتمل تسجيل الدخول. أعد المحاولة.',
    },
  },
  en: {
    link: 'Account',
    login: {
      title: 'Sign in',
      lead: 'Signing in is optional. Scans stay free and need no account. You sign in with Google, so there is no password to make or lose.',
      keeps:
        'We keep your email address, your name, the language you choose, and one cookie that keeps you signed in. We keep no password, no profile picture and nothing else from your Google account. You can delete your account at any time.',
      preparing: 'Getting the Google button ready…',
      fallback: 'Google’s button could not load here, so sign in on Google’s own page.',
      google: 'Sign in with Google',
      working: 'Signing you in…',
      pageTitle: 'Sign in — Arablyzer',
      pageDescription:
        'Sign in to your Arablyzer account with Google. Signing in is optional; scanning is free without one.',
    },
    account: {
      title: 'Your account',
      lead: 'You are signed in with Google.',
      email: 'Email',
      name: 'Name',
      language: 'Language',
      languageHint: 'The language of your account.',
      signOut: 'Sign out',
      signOutEverywhere: 'Sign out everywhere',
      signedOut: 'You are signed out.',
      loading: 'Opening your account…',
      pageTitle: 'Your account — Arablyzer',
      pageDescription:
        'Your Arablyzer account: your email and language, signing out and deleting it.',
      unavailable: 'Accounts are not turned on on this site. Scanning works as usual without one.',
    },
    delete: {
      title: 'Delete account',
      text: 'This erases your account, your sessions, and the email address and name we kept. It cannot be undone. Reports from scans you ran are not tied to your account and stay as they are.',
      open: 'Delete account…',
      confirm: 'Delete my account for good',
      cancel: 'Cancel',
      working: 'Deleting the account…',
      freshNeeded: 'To keep you safe, sign in again before deleting. It only takes a moment.',
      signInAgain: 'Sign in again',
      done: 'Your account was deleted.',
      doneDetail: 'We keep nothing about you.',
    },
    problems: {
      'bad-request': 'We could not read that request. Reload the page and try again.',
      'rate-limited': 'Too many attempts.',
      unauthorized: 'You are not signed in.',
      'invalid-token': 'Google’s answer was not accepted. Try again.',
      'fresh-login-required': 'To keep you safe, sign in again, then try again.',
      'not-found': 'Accounts are not turned on on this site.',
      unavailable: 'The account service is not available right now. Try again in a moment.',
      network: 'We could not reach the service. Check your connection and try again.',
      unverified: 'Google did not confirm your email address, so we cannot sign you in with it.',
      cancelled: 'Sign-in was cancelled.',
      failed: 'Sign-in did not complete. Try again.',
    },
  },
}
