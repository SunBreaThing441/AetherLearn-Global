# AetherLearn Global // UNESCO Open Learning Initiative

> **Autonomous Adaptive Interactive Learning Platform & Pedagogical Runtime**
> *Dedicated to UNESCO SDG 4: Inclusive and Equitable Quality Education for All.*

[![Status](https://img.shields.io/badge/Status-Operational-brightgreen)](#)
[![Architecture](https://img.shields.io/badge/Architecture-WSGI%20%2B%20Angular%2011%20%2B%20NoSQL-cyan)](#)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

---

## 🌐 Overview & Pedagogical Mission

**AetherLearn Global** is a free, open-source online learning platform designed to provide accessible, scaffolded, and high-quality education to learners worldwide. Inspired by Benjamin Bloom's *"Two Sigma Problem"* (which observed that one-on-one tutored students perform two standard deviations better than conventionally taught students), AetherLearn Global simulates an interactive, adaptive dialogue with a personal tutor rather than presenting passive video lectures.

The platform directly advances **UNESCO Sustainable Development Goal 4 (SDG-4)**:
1. **Adaptive Pedagogical Conversations**: Lessons (*Explorations*) dynamically adapt to learner responses in real time, delivering scaffolded feedback, hints, and tailored remediation paths.
2. **Low-Bandwidth & Inclusive Deployment**: Lightweight client footprint, mobile-optimized card layouts, and offline/audio accessibility.
3. **Open Community Authoring & Crowdsourcing**: Community-driven lesson creation, multi-language localization (Hindi, Spanish, Swahili, Portuguese, Arabic, etc.), and voiceover recording.

---

## 🏛️ System Architecture & Repository Structure

```text
AetherLearn-Global/
├── oppia/                         # Full-stack application core
│   ├── assets/                    # Static assets, logos, and i18n localization dicts
│   │   ├── images/logo/           # AetherLearn brand identity & vector marks
│   │   ├── i18n/                  # Multi-language translation packs
│   │   └── scripts/               # Modern SPA bundles and styling
│   ├── core/                      # Application backend & frontend templates
│   │   ├── controllers/           # REST / WSGI request handlers
│   │   ├── domain/                # Business logic, state machines & models
│   │   ├── storage/               # Google Cloud NDB Datastore entities
│   │   └── templates/             # Angular 11 components and UI pages
│   │       ├── pages/             # Portal pages (splash, player, creator, dashboards)
│   │       └── components/        # Reusable UI directives and widgets
│   ├── data/                      # Persistent curriculum & exploration libraries
│   │   ├── explorations/          # Production YAML exploration definitions
│   │   └── collections/           # Curated topic sequences
│   ├── scripts/                   # Tooling, linters & dev server engines
│   │   └── serve.py               # All-in-one standalone development server & API hub
│   └── package.json               # Frontend dependencies & workspace manifests
├── PROJECT_OVERVIEW.md            # Complete architecture & database specification
├── .gitignore                     # Monorepo ignore rules
└── README.md                      # Primary ecosystem overview & guide
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Python 3.10+** (Python 3.12 / 3.14 verified)
- **PyYAML** (`pip install pyyaml`)

### 2. Launch Development Server
Start the standalone development server and REST API hub:

```powershell
# From the repository root
python oppia/scripts/serve.py
```

The server automatically starts and listens on `http://localhost:8181`.

---

## 🧭 Live Endpoints & Portals

| Portal / View | Route | Description |
| :--- | :--- | :--- |
| **Splash / Home Portal** | [`/splash`](http://localhost:8181/splash) | Exploration discovery catalog & community highlights |
| **Interactive Player** | [`/explore/welcome`](http://localhost:8181/explore/welcome) | Real-time adaptive exploration state machine |
| **Creator Studio** | [`/create/welcome`](http://localhost:8181/create/welcome) | Visual authoring studio with draggable cards & preview |
| **Learner Dashboard** | [`/learner-dashboard`](http://localhost:8181/learner-dashboard) | Student progress, learning streaks & active playlists |
| **Creator Dashboard** | [`/creator-dashboard`](http://localhost:8181/creator-dashboard) | Exploration metrics, analytics & community feedback |
| **Contributor Portal** | [`/contributor-dashboard`](http://localhost:8181/contributor-dashboard) | Global localization & voiceover translation tasks |
| **AetherLearn SPA** | [`/modern`](http://localhost:8181/modern) | Modern UNESCO modular frontend interface |
| **API Documentation Hub** | [`/api/docs`](http://localhost:8181/api/docs) | Interactive REST API explorer and schema tester |

---

## ⚙️ Active REST API Contract Matrix

| Endpoint | Method | Response Schema | Purpose |
| :--- | :--- | :--- | :--- |
| `/csrfhandler` | `GET` | `{"token": string}` | Security CSRF token verification |
| `/userinfohandler` | `GET` | User identity & RBAC roles | Authenticated user profile & preferences |
| `/explorehandler/init/<id>` | `GET` | State tree, version & session ID | Initializes exploration interactive session |
| `/explorehandler/answer_submitted_event/<id>` | `POST` | Feedback & destination card | Submits learner answers & advances state machine |
| `/learnerdashboarddatahandler` | `GET` | Completed & in-progress lists | Learner progression metrics |
| `/creatordashboarddatahandler` | `GET` | Authored items & play statistics | Author dashboard metrics |
| `/contributordashboarddatahandler` | `GET` | Translation & voiceover queues | Community crowdsourcing portal |
| `/libraryindexhandler` | `GET` | Featured exploration groups | Curated curriculum catalog |

---

## 📜 License
This project is licensed under the Apache License 2.0.
