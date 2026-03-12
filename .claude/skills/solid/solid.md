# Skill: Principes SOLID en Rust

> Référence pour appliquer les principes SOLID dans le contexte Rust/Flux

---

## 1. Single Responsibility Principle (SRP)

**Un module/struct = une seule raison de changer**

### En Rust

- Séparer les modules par responsabilité
- Un struct gère une seule préoccupation
- Le système de ownership renforce naturellement ce principe

### Exemple

```rust
// BIEN : Responsabilités séparées
pub struct ConfigLoader {
    path: PathBuf,
}

impl ConfigLoader {
    pub fn load(&self) -> Result<Config, ConfigError> {
        let contents = fs::read_to_string(&self.path)?;
        toml::from_str(&contents).map_err(Into::into)
    }
}

pub struct SessionManager {
    config: Config,
}

impl SessionManager {
    pub fn start(&mut self) -> Result<Session, SessionError> {
        // Gère uniquement la logique de session
    }
}

// MAL : Struct "god object"
pub struct App {
    config_path: PathBuf,
    running: bool,
    blocked_sites: Vec<String>,
    // Fait tout : config, session, blocage, stats...
}
```

### Application Flux

| Module | Responsabilité unique |
|--------|----------------------|
| `config.rs` | Chargement/sauvegarde configuration |
| `timer.rs` | Gestion des timers |
| `blocker.rs` | Manipulation /etc/hosts |
| `notifier.rs` | Envoi de notifications |
| `stats.rs` | Persistance des statistiques |

---

## 2. Open/Closed Principle (OCP)

**Ouvert à l'extension, fermé à la modification**

### En Rust

- **Traits** pour les points d'extension
- **Enums** pour les ensembles fermés (exhaustive matching)
- Trait objects (`dyn Trait`) ou génériques pour l'extensibilité

### Exemple

```rust
// BIEN : Extensible via trait
pub trait OutputFormatter {
    fn format(&self, stats: &Stats) -> String;
}

pub struct JsonFormatter;
pub struct TextFormatter;
pub struct CsvFormatter;

impl OutputFormatter for JsonFormatter {
    fn format(&self, stats: &Stats) -> String {
        serde_json::to_string_pretty(stats).unwrap()
    }
}

// Ajouter un nouveau format = créer un nouveau struct
// Pas besoin de modifier le code existant

// Pour les sets fermés, utiliser enum
pub enum CheckInResponse {
    Continue,
    Pause { duration_min: u32 },
    Stop,
    NoResponse,
}
```

### Application Flux

- `trait Blocker` → permet d'avoir HostsBlocker, FirewallBlocker, etc.
- `trait Notifier` → permet desktop, sound, webhook...
- `enum FocusMode` → prompting, review, architecture (set fermé)

---

## 3. Liskov Substitution Principle (LSP)

**Les implémentations doivent respecter le contrat du trait**

### En Rust

- Une impl de trait ne doit jamais panic si le trait ne le spécifie pas
- Comportement cohérent entre toutes les implémentations
- Utiliser les types associés pour contraindre

### Exemple

```rust
// BIEN : Toutes les implémentations respectent le contrat
pub trait Storage {
    type Error: std::error::Error;

    /// Sauvegarde une session. Ne panic jamais.
    fn save(&self, session: &Session) -> Result<(), Self::Error>;
}

impl Storage for SqliteStorage {
    type Error = rusqlite::Error;

    fn save(&self, session: &Session) -> Result<(), Self::Error> {
        // Retourne Err, ne panic pas
        self.conn.execute(...)?;
        Ok(())
    }
}

impl Storage for MemoryStorage {
    type Error = std::convert::Infallible;

    fn save(&self, session: &Session) -> Result<(), Self::Error> {
        self.data.push(session.clone());
        Ok(())
    }
}

// MAL : Viole le contrat
impl Storage for BrokenStorage {
    fn save(&self, session: &Session) -> Result<(), Self::Error> {
        if !self.ready {
            panic!("Not ready!"); // VIOLATION LSP
        }
        Ok(())
    }
}
```

---

## 4. Interface Segregation Principle (ISP)

**Petits traits focalisés plutôt que gros traits**

### En Rust

- Créer des traits avec peu de méthodes
- Composer les traits selon les besoins
- Les clients dépendent uniquement de ce qu'ils utilisent

### Exemple

```rust
// BIEN : Traits séparés
pub trait Startable {
    fn start(&mut self) -> Result<(), Error>;
}

pub trait Stoppable {
    fn stop(&mut self) -> Result<(), Error>;
}

pub trait Pausable {
    fn pause(&mut self) -> Result<(), Error>;
    fn resume(&mut self) -> Result<(), Error>;
}

// Composer selon les besoins
pub struct FocusSession;
impl Startable for FocusSession { /* ... */ }
impl Stoppable for FocusSession { /* ... */ }
impl Pausable for FocusSession { /* ... */ }

pub struct QuickTimer;
impl Startable for QuickTimer { /* ... */ }
impl Stoppable for QuickTimer { /* ... */ }
// Pas Pausable - un quick timer ne se met pas en pause

// MAL : Trait "fat"
pub trait SessionManager {
    fn start(&mut self);
    fn stop(&mut self);
    fn pause(&mut self);
    fn resume(&mut self);
    fn get_stats(&self) -> Stats;
    fn export_csv(&self) -> String;
    fn sync_to_cloud(&self);  // Pas tous les managers sync
    fn enable_ai_mode(&mut self); // Pas pertinent pour tous
}
```

### Application Flux

```rust
// Traits fins pour le daemon
pub trait TimerControl {
    fn start(&mut self, duration: Duration);
    fn stop(&mut self);
    fn remaining(&self) -> Duration;
}

pub trait BlockerControl {
    fn block(&mut self, domain: &str) -> Result<()>;
    fn unblock(&mut self, domain: &str) -> Result<()>;
}

pub trait NotificationSender {
    fn send(&self, message: &str) -> Result<()>;
}
```

---

## 5. Dependency Inversion Principle (DIP)

**Dépendre des abstractions (traits), pas des implémentations concrètes**

### En Rust

- Injection de dépendances via génériques ou trait objects
- Les modules de haut niveau définissent les traits
- Les modules de bas niveau implémentent les traits

### Exemple

```rust
// BIEN : Le service dépend d'un trait
pub trait ConfigSource {
    fn get(&self, key: &str) -> Option<String>;
}

pub struct DaemonService<C: ConfigSource, N: NotificationSender> {
    config: C,
    notifier: N,
}

impl<C: ConfigSource, N: NotificationSender> DaemonService<C, N> {
    pub fn new(config: C, notifier: N) -> Self {
        Self { config, notifier }
    }

    pub fn start_focus(&self) -> Result<()> {
        let duration = self.config.get("default_duration")
            .and_then(|s| s.parse().ok())
            .unwrap_or(25);

        self.notifier.send(&format!("Focus démarré pour {} min", duration))?;
        Ok(())
    }
}

// Facile à tester avec des mocks
#[cfg(test)]
mod tests {
    struct MockConfig(HashMap<String, String>);
    impl ConfigSource for MockConfig { /* ... */ }

    struct MockNotifier(Vec<String>);
    impl NotificationSender for MockNotifier { /* ... */ }

    #[test]
    fn test_start_focus() {
        let config = MockConfig::new();
        let notifier = MockNotifier::new();
        let service = DaemonService::new(config, notifier);

        service.start_focus().unwrap();
        // Assert sur notifier.messages
    }
}

// MAL : Dépendance concrète
pub struct DaemonService {
    config: TomlConfig,        // Couplé à TOML
    notifier: DesktopNotifier, // Couplé à desktop
}
```

### Application Flux

```
flux-core/
├── traits.rs      # Définit ConfigSource, Storage, Notifier...
├── session.rs     # Utilise les traits, pas les impls

flux-daemon/
├── sqlite_storage.rs   # impl Storage for SqliteStorage
├── desktop_notifier.rs # impl Notifier for DesktopNotifier
├── main.rs             # Assemble les dépendances concrètes
```

---

## Checklist SOLID pour review

- [ ] **SRP** : Ce module a-t-il une seule raison de changer ?
- [ ] **OCP** : Puis-je ajouter un comportement sans modifier l'existant ?
- [ ] **LSP** : Toutes les impls de ce trait sont-elles interchangeables ?
- [ ] **ISP** : Ce trait pourrait-il être découpé en traits plus fins ?
- [ ] **DIP** : Ce module dépend-il de traits ou de types concrets ?
