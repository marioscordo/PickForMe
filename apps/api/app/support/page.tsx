export const metadata = {
  title: "Support | PickForMe",
  description: "Support und Account-Loeschung fuer PickForMe"
};

export default function SupportPage() {
  return (
    <main style={{
      maxWidth: 760,
      margin: "0 auto",
      padding: "48px 20px 72px",
      lineHeight: 1.6
    }}>
      <p style={{ color: "#667085", margin: "0 0 8px" }}>PickForMe</p>
      <h1 style={{ fontSize: 36, lineHeight: 1.15, margin: 0 }}>Support</h1>
      <p>
        Hilfe, Datenschutzanfragen und Account-Loeschanfragen koennen per E-Mail gestellt werden:
        <br />
        <a href="mailto:support@pickforme.app">support@pickforme.app</a>
      </p>

      <section style={{ marginTop: 28 }}>
        <h2>Account und Daten loeschen</h2>
        <p>
          In der App kann der Account unter Profil dauerhaft geloescht werden. Dabei werden der Account und die
          gespeicherten PickForMe-Daten entfernt. Falls der Zugriff auf die App nicht moeglich ist, kann die Loeschung
          per E-Mail angefragt werden.
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2>Fehler melden</h2>
        <p>
          Bitte beschreibe das Problem, das verwendete Geraet, die App-Version und wenn moeglich die Schritte, mit
          denen der Fehler reproduziert werden kann.
        </p>
      </section>
    </main>
  );
}
