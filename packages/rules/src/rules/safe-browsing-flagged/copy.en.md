# Google Safe Browsing flags the site

## Messages

### malware

Google Safe Browsing lists this site as distributing malware ({url}).

### social-engineering

Google Safe Browsing lists this site as deceptive, a phishing or social engineering page ({url}).

### unwanted-software

Google Safe Browsing lists this site as offering unwanted software ({url}).

### harmful-app

Google Safe Browsing lists this site as offering a potentially harmful application ({url}).

## Why it matters

- Chrome, Firefox, Safari and other browsers check the addresses people open against Google's Safe Browsing lists. For a listed site they show a full-page red warning, and most visitors turn back.
- Search results can carry a warning too, and ad accounts and email providers use the same lists, so a listing costs traffic, sales and the delivery of the site's emails.
- A listing is often not the owner's doing: a hacked plugin, an injected script or a compromised account can put malware or a phishing page on a healthy site, and the owner learns of it from the warning.

## How to fix

- Find what Google found. In Google Search Console, the Security issues report names the URLs and the kind of problem; connect the site there first.
- Clean the site: restore from a backup made before the infection, remove the injected files and scripts, update the CMS, themes and plugins, and change every password and key (hosting, CMS, database, FTP).
- Close the way in, or it comes back: remove accounts and plugins you do not use, and keep the software updated.
- Then ask Google to review the site from the Security issues report in Search Console. A review usually takes a few days, and the warning goes once Google finds the site clean.
- If your site is a service others use to publish pages, make sure its users cannot host phishing or malware on it: Google lists the whole site for that.

## How we detect

1. With a Google API key, we ask the Safe Browsing Lookup API (v4, `threatMatches:find`) about the page's address and its origin, for malware, social engineering, unwanted software and potentially harmful applications on any platform.
2. The rule fails, critical, for each kind of threat Google lists, and shows the address Google listed.
3. The address of the page goes to Google with the key, and nothing else of the page. Nothing is kept from one scan to the next.
4. Without a key, or for a page on a local or private address, nothing is asked and the rule does not apply. If Google gives no answer, the rule reports that it could not check; it never reads a failure as a clean site.
5. This is Google's list at the time of the scan. A site Google has not listed may still be unsafe, and a listing may take a day or more to appear or to clear.

## References

- [Google Safe Browsing: Lookup API (v4)](https://developers.google.com/safe-browsing/v4/lookup-api)
- [Google Safe Browsing: threat types](https://developers.google.com/safe-browsing/v4/reference/rest/v4/ThreatType)
- [Google Search Central: Security issues report](https://support.google.com/webmasters/answer/9044101)
- [Google Search Central: Request a review of a hacked site](https://developers.google.com/search/docs/monitor-debug/security/hacked)
