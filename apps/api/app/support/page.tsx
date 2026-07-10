import { Fragment, type ReactNode } from "react";

const contactEmail = "kontakt@gustaroai.com";

const sectionStyle = {
  marginTop: 28
};

type LegalLanguage = "de" | "en";
type PageSearchParams = { lang?: string | string[] };
type LegalPageProps = {
  searchParams?: PageSearchParams | Promise<PageSearchParams>;
};
type SupportSection = {
  title: string;
  body: ReactNode[];
};

const supportContent: Record<LegalLanguage, {
  lang: string;
  metadata: {
    title: string;
    description: string;
  };
  title: string;
  intro: ReactNode;
  sections: SupportSection[];
}> = {
  de: {
    lang: "de",
    metadata: {
      title: "Support | GustaroAI",
      description: "Support und Account-Löschung für GustaroAI"
    },
    title: "Support",
    intro: (
      <p>
        Hilfe zu GustaroAI, Datenschutzanfragen und Account-Löschanfragen können per E-Mail gestellt werden:
        <br />
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </p>
    ),
    sections: [
      {
        title: "Hilfe bei Login und Account",
        body: [
          <p>
            Bei Problemen mit Login, Session, Profil oder Accountverwaltung kannst Du Dich per E-Mail an{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a> wenden.
          </p>
        ]
      },
      {
        title: "Account und Daten löschen",
        body: [
          <p>
            In der App kann der Account unter „Profil“ dauerhaft gelöscht werden. Dabei werden der Account und die
            gespeicherten GustaroAI-Daten entfernt, soweit keine gesetzlichen Aufbewahrungspflichten oder berechtigten
            Sicherheits- und Nachweispflichten entgegenstehen.
          </p>,
          <p>
            Falls der Zugriff auf die App nicht möglich ist, kann die Löschung per E-Mail an{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a> angefragt werden.
          </p>
        ]
      },
      {
        title: "Fehler in der App melden",
        body: [
          <p>
            In der App steht unter „Profil“ ein Fehlerformular zur Verfügung. Darüber können Fehler, Testfeedback und
            Hinweise zur Qualität der Empfehlungen direkt an GustaroAI gesendet werden.
          </p>,
          <p>Hilfreich sind insbesondere:</p>,
          <ul>
            <li>App-Version und Buildnummer</li>
            <li>verwendetes Gerät</li>
            <li>iOS- oder Android-Version</li>
            <li>Restaurant, Stadt und Speisekartenquelle</li>
            <li>kurze Schritte, mit denen der Fehler reproduziert werden kann</li>
            <li>was Du erwartet hättest</li>
          </ul>,
          <p>
            Alternativ kannst Du Fehlermeldungen per E-Mail an{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a> senden.
          </p>
        ]
      },
      {
        title: "Keine sensiblen Daten senden",
        body: [
          <p>
            Bitte sende keine Passwörter, Zahlungsdaten, Gesundheitsdetails oder sonstige sehr persönliche Informationen
            per Supportnachricht oder Fehlerformular.
          </p>
        ]
      }
    ]
  },
  en: {
    lang: "en",
    metadata: {
      title: "Support | GustaroAI",
      description: "Support and account deletion for GustaroAI"
    },
    title: "Support",
    intro: (
      <p>
        Help with GustaroAI, privacy requests, and account deletion requests can be sent by email:
        <br />
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </p>
    ),
    sections: [
      {
        title: "Help with Login and Account",
        body: [
          <p>
            If you have problems with login, session, profile, or account management, you can contact{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a> by email.
          </p>
        ]
      },
      {
        title: "Delete Account and Data",
        body: [
          <p>
            The account can be permanently deleted in the app under “Profile”. This removes the account and stored
            GustaroAI data unless statutory retention obligations or legitimate security and documentation obligations
            prevent deletion.
          </p>,
          <p>
            If access to the app is not possible, deletion can be requested by email at{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        ]
      },
      {
        title: "Report an Error in the App",
        body: [
          <p>
            An error form is available in the app under “Profile”. It can be used to send errors, test feedback, and
            notes about recommendation quality directly to GustaroAI.
          </p>,
          <p>The following information is especially helpful:</p>,
          <ul>
            <li>App version and build number</li>
            <li>Device used</li>
            <li>iOS or Android version</li>
            <li>Restaurant, city, and menu source</li>
            <li>Short steps that can reproduce the error</li>
            <li>What you would have expected</li>
          </ul>,
          <p>
            Alternatively, you can send error reports by email to{" "}
            <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
          </p>
        ]
      },
      {
        title: "Do Not Send Sensitive Data",
        body: [
          <p>
            Please do not send passwords, payment data, health details, or other very personal information by support
            message or error form.
          </p>
        ]
      }
    ]
  }
};

function resolveLegalLanguage(value: string | string[] | undefined): LegalLanguage {
  const raw = Array.isArray(value) ? value[0] : value;

  return raw?.toLowerCase().startsWith("en") ? "en" : "de";
}

async function resolveSearchParams(searchParams: LegalPageProps["searchParams"]) {
  return Promise.resolve(searchParams ?? {});
}

export async function generateMetadata({ searchParams }: LegalPageProps) {
  const params = await resolveSearchParams(searchParams);
  const language = resolveLegalLanguage(params.lang);

  return supportContent[language].metadata;
}

export default async function SupportPage({ searchParams }: LegalPageProps) {
  const params = await resolveSearchParams(searchParams);
  const language = resolveLegalLanguage(params.lang);
  const content = supportContent[language];

  return (
    <main lang={content.lang} style={{
      maxWidth: 760,
      margin: "0 auto",
      padding: "48px 20px 72px",
      lineHeight: 1.6
    }}>
      <p style={{ color: "#667085", margin: "0 0 8px" }}>GustaroAI</p>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: 0 }}>{content.title}</h1>
      {content.intro}

      {content.sections.map((section) => (
        <section key={section.title} style={sectionStyle}>
          <h2>{section.title}</h2>
          {section.body.map((item, index) => (
            <Fragment key={index}>{item}</Fragment>
          ))}
        </section>
      ))}
    </main>
  );
}
