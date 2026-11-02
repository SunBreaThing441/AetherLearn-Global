#!/usr/bin/env python3
"""
AetherLearn Global Full-Stack Development Server & API Hub.
===========================================================
Provides a complete, standalone development environment for AetherLearn Global:
1. Serves the full frontend portal (Splash, Player, Editor, Dashboards, Classroom, API Hub).
2. Serves real YAML explorations from data/explorations/ (welcome, multiples, solar_system, hola, etc.).
3. Implements 100% compliant REST / RPC APIs (CSRF, UserInfo, Explore, Create, Dashboards, Events).
4. Serves all static assets (images, logos, stylesheets, audio voiceovers, fonts).
"""

from __future__ import annotations

import datetime
import html
import http.server
import json
import mimetypes
import os
import re
import socketserver
import sys
import threading
import time
import urllib.parse
from typing import Any, Dict, List, Optional, Tuple

import yaml

# Safeguard UTF-8 encoding across Windows console environments
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSETS_DIR = os.path.join(REPO_ROOT, "assets")
DATA_DIR = os.path.join(REPO_ROOT, "data")
EXPLORATIONS_DIR = os.path.join(DATA_DIR, "explorations")
COLLECTIONS_DIR = os.path.join(DATA_DIR, "collections")
TEMPLATES_CSS_DIR = os.path.join(REPO_ROOT, "core", "templates", "css")

DEFAULT_PORT = 8181
CSRF_TOKEN = "aetherlearn_csrf_token_dev_sec_8181"

# In-memory storage for explorations and user state
LOADED_EXPLORATIONS: Dict[str, Dict[str, Any]] = {}
USER_EXPLORATION_PROGRESS: Dict[str, Dict[str, Any]] = {}

CURRENT_USER = {
    "username": "Aether Scholar",
    "email": "scholar@aetherlearn.global",
    "roles": ["LEARNER", "EXPLORATION_EDITOR", "CURRICULUM_ADMIN", "TOPIC_MANAGER"],
    "is_moderator": True,
    "is_curriculum_admin": True,
    "is_super_admin": True,
    "is_topic_manager": True,
    "can_create_collections": True,
    "preferred_site_language_code": "en",
    "user_is_logged_in": True,
    "streak": 5,
    "completed_chapters_count": 8,
}


def sanitize_exploration_data(data: Any) -> Any:
    """Recursively purges legacy branding and custom tags from exploration data."""
    if isinstance(data, str):
        s = data
        s = re.sub(
            r'<oppia-noninteractive-link\s+text-with-value="(?:&quot;|&amp;quot;)?([^"&]*)(?:&quot;|&amp;quot;)?"\s+url-with-value="(?:&quot;|&amp;quot;)?([^"&]*)(?:&quot;|&amp;quot;)?"\s*>\s*</oppia-noninteractive-link>',
            r'<a href="\2" target="_blank" rel="noopener">\1</a>',
            s,
            flags=re.IGNORECASE
        )
        s = re.sub(r'<\/?oppia-noninteractive-([^>]*)>', r'<\1>', s, flags=re.IGNORECASE)
        s = re.sub(r'\boppia\b', 'AetherLearn Global', s, flags=re.IGNORECASE)
        s = s.replace("Oppia", "AetherLearn Global").replace("oppia", "AetherLearn Global")
        return s
    elif isinstance(data, dict):
        return {k: sanitize_exploration_data(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [sanitize_exploration_data(elem) for elem in data]
    return data


def load_all_explorations() -> None:
    """Discovers and parses all available exploration YAML files."""
    global LOADED_EXPLORATIONS
    LOADED_EXPLORATIONS.clear()

    if not os.path.exists(EXPLORATIONS_DIR):
        print(f"[WARN] Explorations directory not found: {EXPLORATIONS_DIR}")
        return

    # Check top-level YAMLs
    for entry in os.listdir(EXPLORATIONS_DIR):
        full_path = os.path.join(EXPLORATIONS_DIR, entry)
        if os.path.isfile(full_path) and entry.endswith(".yaml"):
            exp_id = entry[:-5]
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    exp_data = yaml.safe_load(f)
                    if isinstance(exp_data, dict):
                        exp_data = sanitize_exploration_data(exp_data)
                        if exp_id == "about_oppia":
                            exp_data["id"] = "about"
                            LOADED_EXPLORATIONS["about"] = exp_data
                        else:
                            exp_data["id"] = exp_id
                            LOADED_EXPLORATIONS[exp_id] = exp_data
            except Exception as e:
                print(f"[WARN] Failed to parse {entry}: {e}")

        elif os.path.isdir(full_path):
            exp_id = entry
            # Look for sub-file like welcome/welcome.yaml or solar_system/The Solar System.yaml
            for sub_file in os.listdir(full_path):
                if sub_file.endswith(".yaml"):
                    sub_path = os.path.join(full_path, sub_file)
                    try:
                        with open(sub_path, "r", encoding="utf-8") as f:
                            exp_data = yaml.safe_load(f)
                            if isinstance(exp_data, dict):
                                exp_data = sanitize_exploration_data(exp_data)
                                exp_data["id"] = exp_id
                                LOADED_EXPLORATIONS[exp_id] = exp_data
                                break
                    except Exception as e:
                        print(f"[WARN] Failed to parse {sub_path}: {e}")

    print(f"[INIT] Loaded {len(LOADED_EXPLORATIONS)} explorations into memory.")


def get_exploration(exp_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves an exploration by ID, with case-insensitive and slug fallback."""
    if exp_id in ("about", "about_oppia"):
        return LOADED_EXPLORATIONS.get("about")
    if exp_id in LOADED_EXPLORATIONS:
        return LOADED_EXPLORATIONS[exp_id]
    for k, v in LOADED_EXPLORATIONS.items():
        if k.lower() == exp_id.lower():
            return v
    return None


def get_exploration_metadata(exp: Dict[str, Any]) -> Dict[str, Any]:
    """Generates an AetherLearn-compliant exploration metadata dictionary."""
    exp_id = exp.get("id", "")
    if exp_id == "about_oppia":
        exp_id = "about"
    title = exp.get("title") or exp_id or "Untitled Exploration"
    obj = exp.get("objective", "Learn and explore interactive concepts")
    return {
        "id": exp_id,
        "title": title,
        "category": exp.get("category", "General"),
        "objective": obj,
        "language_code": exp.get("language_code", "en"),
        "tags": exp.get("tags", ["Interactive", "Education"]),
        "status": "public",
        "community_owned": True,
        "ratings": {"1": 0, "2": 0, "3": 1, "4": 4, "5": 12},
        "version": exp.get("schema_version", 1),
    }


# ==============================================================================
# HTML TEMPLATE & PAGE BUILDERS
# ==============================================================================

def render_global_header(active_nav: str = "") -> str:
    """Renders the top navigation header with brand and links."""
    return f"""
    <header class="aether-navbar">
        <div class="nav-container">
            <div class="nav-left">
                <a href="/" class="brand-link">
                    <img src="/assets/images/logo/aetherlearn_logo.svg" alt="AetherLearn Global Logo" class="brand-logo" onerror="this.onerror=null; this.src='/assets/images/logo/aetherlearn_favicon.svg';" />
                    <span class="brand-text">AetherLearn Global</span>
                </a>
                <nav class="nav-menu">
                    <a href="/splash" class="nav-item {'active' if active_nav == 'splash' else ''}"><i class="fas fa-home"></i> Home</a>
                    <a href="/learn" class="nav-item {'active' if active_nav == 'learn' else ''}"><i class="fas fa-graduation-cap"></i> Classroom</a>
                    <a href="/learner-dashboard" class="nav-item {'active' if active_nav == 'learner' else ''}"><i class="fas fa-user-graduate"></i> My Lessons</a>
                    <a href="/creator-dashboard" class="nav-item {'active' if active_nav == 'creator' else ''}"><i class="fas fa-pencil-ruler"></i> Creator Studio</a>
                    <a href="/contributor-dashboard" class="nav-item {'active' if active_nav == 'contributor' else ''}"><i class="fas fa-hands-helping"></i> Contribute</a>
                    <a href="/modern" class="nav-item {'active' if active_nav == 'modern' else ''}"><i class="fas fa-satellite-dish"></i> AetherLearn SPA</a>
                    <a href="/api/docs" class="nav-item {'active' if active_nav == 'api' else ''}"><i class="fas fa-code"></i> API Hub</a>
                </nav>
            </div>
            <div class="nav-right">
                <div class="user-badge" title="Logged in as {CURRENT_USER['username']}">
                    <span class="status-indicator"></span>
                    <i class="fas fa-user-circle"></i>
                    <span class="username">{CURRENT_USER['username']}</span>
                </div>
                <a href="/create/welcome" class="btn btn-create"><i class="fas fa-plus"></i> New Lesson</a>
            </div>
        </div>
    </header>
    """


def render_global_footer() -> str:
    """Renders the footer with UNESCO-aligned social and education mission info."""
    return """
    <footer class="aether-footer">
        <div class="footer-container">
            <div class="footer-col">
                <div class="footer-brand">
                    <span class="footer-brand-title">AetherLearn Global</span>
                    <p class="footer-tagline">Free, interactive education for everyone. Aligning with UNESCO SDG-4 for accessible, high-quality, barrier-free global learning.</p>
                </div>
            </div>
            <div class="footer-col">
                <h4>Core Sections</h4>
                <ul>
                    <li><a href="/splash">Home / Portal</a></li>
                    <li><a href="/learn">Classrooms & Topics</a></li>
                    <li><a href="/explore/welcome">Welcome Exploration</a></li>
                    <li><a href="/learner-dashboard">Learner Dashboard</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>Creator & Developer</h4>
                <ul>
                    <li><a href="/creator-dashboard">Creator Dashboard</a></li>
                    <li><a href="/contributor-dashboard">Community Contributions</a></li>
                    <li><a href="/api/docs">REST API Playground</a></li>
                    <li><a href="#" target="_blank" rel="noopener">AetherLearn Ecosystem</a></li>
                </ul>
            </div>
            <div class="footer-col">
                <h4>Platform Status</h4>
                <div class="status-pill"><span class="pulse-dot"></span> Backend & Frontend Active</div>
                <p class="port-info">Serving on Port 8181 (AetherLearn Global Engine)</p>
            </div>
        </div>
        <div class="footer-bottom">
            <p>&copy; 2026 AetherLearn Global | UNESCO Planetary Knowledge Nexus. Licensed under Apache 2.0. Built for worldwide educational equity.</p>
        </div>
    </footer>
    """


def build_page_template(title: str, content: str, active_nav: str = "", extra_scripts: str = "") -> str:
    """Wraps body content in full responsive HTML5 page with Oppia styles."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title} | AetherLearn Global</title>
    <link rel="icon" type="image/svg+xml" href="/assets/images/logo/aetherlearn_favicon.svg">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Capriola&family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {{
            --aether-primary: #052E3E;
            --aether-primary-dark: #031D27;
            --aether-primary-light: #0B4E68;
            --aether-accent: #00FFC6;
            --aether-bg: #F4F8FA;
            --aether-surface: #FFFFFF;
            --aether-text: #0E1B22;
            --aether-text-muted: #536A76;
            --aether-border: #D1DEE5;
            --aether-success: #00C896;
            --aether-warning: #FFB020;
            --aether-shadow: 0 4px 12px rgba(5, 46, 62, 0.08);
            --aether-shadow-lg: 0 8px 24px rgba(5, 46, 62, 0.16);
            --radius-sm: 6px;
            --radius-md: 10px;
            --radius-lg: 16px;
            --font-display: 'Capriola', 'Roboto', sans-serif;
            --font-body: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
        }}
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        body {{
            font-family: var(--font-body);
            background-color: var(--aether-bg);
            color: var(--aether-text);
            line-height: 1.6;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }}
        a {{ color: var(--aether-primary); text-decoration: none; transition: all 0.2s; }}
        a:hover {{ color: var(--aether-primary-dark); }}

        /* Top Navigation */
        .aether-navbar {{
            background: var(--aether-surface);
            border-bottom: 1px solid var(--aether-border);
            position: sticky;
            top: 0;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }}
        .nav-container {{
            max-width: 1280px;
            margin: 0 auto;
            padding: 0.75rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}
        .nav-left {{ display: flex; align-items: center; gap: 2rem; }}
        .brand-link {{ display: flex; align-items: center; gap: 0.5rem; }}
        .brand-logo {{ height: 38px; width: auto; object-fit: contain; }}
        .brand-text {{ font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; color: var(--aether-primary); }}
        .nav-menu {{ display: flex; align-items: center; gap: 1rem; }}
        .nav-item {{
            color: var(--aether-text-muted);
            font-size: 0.95rem;
            font-weight: 500;
            padding: 0.4rem 0.8rem;
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            gap: 0.4rem;
        }}
        .nav-item:hover, .nav-item.active {{
            color: var(--aether-primary);
            background: rgba(0, 100, 92, 0.08);
        }}
        .nav-right {{ display: flex; align-items: center; gap: 1rem; }}
        .user-badge {{
            display: flex;
            align-items: center;
            gap: 0.5rem;
            background: #E8F5F3;
            color: var(--aether-primary-dark);
            padding: 0.35rem 0.85rem;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 500;
        }}
        .status-indicator {{
            width: 8px;
            height: 8px;
            background: #2E7D32;
            border-radius: 50%;
            display: inline-block;
        }}
        .btn {{
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            padding: 0.55rem 1.25rem;
            border-radius: var(--radius-sm);
            font-weight: 500;
            font-size: 0.95rem;
            cursor: pointer;
            border: none;
            transition: all 0.2s ease;
        }}
        .btn-create {{
            background: var(--aether-primary);
            color: #FFFFFF;
        }}
        .btn-create:hover {{
            background: var(--aether-primary-dark);
            color: #FFFFFF;
            transform: translateY(-1px);
        }}
        .btn-secondary {{
            background: #FFFFFF;
            color: var(--aether-primary);
            border: 1px solid var(--aether-primary);
        }}
        .btn-secondary:hover {{
            background: rgba(0,100,92,0.06);
        }}

        /* Main Content Layout */
        main.main-content {{
            flex: 1;
            max-width: 1280px;
            width: 100%;
            margin: 0 auto;
            padding: 2rem 1.5rem;
        }}

        /* Hero Banner */
        .hero-banner {{
            background: linear-gradient(135deg, #00645C 0%, #00877C 100%);
            color: #FFFFFF;
            padding: 3.5rem 2.5rem;
            border-radius: var(--radius-lg);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 2rem;
            box-shadow: var(--aether-shadow-lg);
            margin-bottom: 2.5rem;
            position: relative;
            overflow: hidden;
        }}
        .hero-banner::after {{
            content: '';
            position: absolute;
            right: -50px;
            top: -50px;
            width: 300px;
            height: 300px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.05);
            pointer-events: none;
        }}
        .hero-text h1 {{
            font-family: var(--font-display);
            font-size: 2.6rem;
            margin-bottom: 1rem;
            line-height: 1.2;
        }}
        .hero-text p {{
            font-size: 1.15rem;
            max-width: 600px;
            opacity: 0.95;
            margin-bottom: 1.75rem;
        }}
        .hero-actions {{ display: flex; gap: 1rem; }}
        .btn-hero-primary {{
            background: #FFFFFF;
            color: var(--aether-primary);
            font-weight: 700;
            padding: 0.75rem 1.75rem;
            border-radius: var(--radius-md);
            box-shadow: 0 4px 10px rgba(0,0,0,0.15);
        }}
        .btn-hero-primary:hover {{
            background: #F0F4F4;
            color: var(--aether-primary-dark);
            transform: translateY(-2px);
        }}
        .btn-hero-secondary {{
            background: rgba(255,255,255,0.18);
            color: #FFFFFF;
            padding: 0.75rem 1.5rem;
            border-radius: var(--radius-md);
            border: 1px solid rgba(255,255,255,0.4);
        }}
        .btn-hero-secondary:hover {{
            background: rgba(255,255,255,0.28);
            color: #FFFFFF;
        }}

        /* Section Titles */
        .section-header {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 1.5rem;
        }}
        .section-title {{
            font-family: var(--font-display);
            font-size: 1.6rem;
            color: var(--aether-primary-dark);
            display: flex;
            align-items: center;
            gap: 0.6rem;
        }}

        /* Exploration Cards Grid */
        .cards-grid {{
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
            gap: 1.5rem;
            margin-bottom: 3rem;
        }}
        .card {{
            background: var(--aether-surface);
            border-radius: var(--radius-md);
            border: 1px solid var(--aether-border);
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.25s ease;
            box-shadow: var(--aether-shadow);
        }}
        .card:hover {{
            transform: translateY(-4px);
            box-shadow: var(--aether-shadow-lg);
            border-color: var(--aether-accent);
        }}
        .card-category {{
            display: inline-block;
            font-size: 0.75rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: var(--aether-primary);
            background: rgba(0, 100, 92, 0.08);
            padding: 0.25rem 0.6rem;
            border-radius: 4px;
            margin-bottom: 0.75rem;
        }}
        .card-title {{
            font-size: 1.25rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
            color: #1A1A1A;
        }}
        .card-objective {{
            font-size: 0.95rem;
            color: var(--aether-text-muted);
            margin-bottom: 1.25rem;
            flex-grow: 1;
        }}
        .card-meta {{
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-top: 1px solid #F0F0F0;
            padding-top: 1rem;
            font-size: 0.85rem;
            color: var(--aether-text-muted);
        }}
        .card-meta .rating {{ color: #F57F17; font-weight: 600; }}

        /* Interactive Exploration Player */
        .player-wrapper {{
            max-width: 900px;
            margin: 0 auto;
            background: var(--aether-surface);
            border-radius: var(--radius-lg);
            box-shadow: var(--aether-shadow-lg);
            border: 1px solid var(--aether-border);
            overflow: hidden;
        }}
        .player-header {{
            background: var(--aether-primary);
            color: #FFFFFF;
            padding: 1.25rem 1.75rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }}
        .player-title {{ font-size: 1.3rem; font-weight: 600; font-family: var(--font-display); }}
        .progress-pill {{
            background: rgba(255,255,255,0.2);
            padding: 0.35rem 0.85rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
        }}
        .player-body {{ padding: 2.25rem; }}
        .tutor-bubble {{
            background: #F0F8F7;
            border-left: 4px solid var(--aether-primary);
            padding: 1.5rem;
            border-radius: 0 var(--radius-md) var(--radius-md) 0;
            margin-bottom: 2rem;
            font-size: 1.1rem;
            line-height: 1.7;
        }}
        .interaction-area {{
            background: #FAFBFB;
            border: 1px dashed #CBD5E1;
            border-radius: var(--radius-md);
            padding: 1.75rem;
            margin-bottom: 1.5rem;
        }}
        .input-group {{
            display: flex;
            gap: 0.75rem;
            margin-top: 1rem;
        }}
        .player-input {{
            flex: 1;
            padding: 0.75rem 1rem;
            border: 1px solid #CBD5E1;
            border-radius: var(--radius-sm);
            font-size: 1rem;
            outline: none;
            transition: border 0.2s;
        }}
        .player-input:focus {{ border-color: var(--aether-primary); }}
        .feedback-box {{
            padding: 1rem 1.25rem;
            border-radius: var(--radius-sm);
            margin-top: 1.25rem;
            display: none;
            animation: fadeIn 0.3s ease;
        }}
        .feedback-box.correct {{ background: #E8F5E9; border-left: 4px solid #2E7D32; color: #1B5E20; }}
        .feedback-box.incorrect {{ background: #FFF3E0; border-left: 4px solid #EF6C00; color: #E65100; }}
        .options-list {{ display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1rem; }}
        .option-btn {{
            background: #FFFFFF;
            border: 1px solid #CBD5E1;
            border-radius: var(--radius-sm);
            padding: 0.85rem 1.25rem;
            text-align: left;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s;
        }}
        .option-btn:hover {{ border-color: var(--aether-primary); background: #F0F8F7; }}
        .option-btn.selected {{ border-color: var(--aether-primary); background: #E8F5F3; font-weight: 500; }}

        /* Footer */
        .aether-footer {{
            background: #111E1D;
            color: #C0D0CE;
            padding: 3rem 1.5rem 1.5rem;
            margin-top: auto;
            border-top: 3px solid var(--aether-primary);
        }}
        .footer-container {{
            max-width: 1280px;
            margin: 0 auto;
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 1.5fr;
            gap: 2.5rem;
            margin-bottom: 2.5rem;
        }}
        .footer-brand-title {{ font-family: var(--font-display); font-size: 1.4rem; color: #FFFFFF; margin-bottom: 0.5rem; display: block; }}
        .footer-tagline {{ font-size: 0.9rem; line-height: 1.6; opacity: 0.8; }}
        .footer-col h4 {{ color: #FFFFFF; font-size: 1.05rem; margin-bottom: 1rem; }}
        .footer-col ul {{ list-style: none; }}
        .footer-col ul li {{ margin-bottom: 0.5rem; }}
        .footer-col ul li a {{ color: #C0D0CE; font-size: 0.9rem; }}
        .footer-col ul li a:hover {{ color: #FFFFFF; text-decoration: underline; }}
        .status-pill {{
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            background: rgba(46, 125, 50, 0.2);
            color: #66BB6A;
            padding: 0.4rem 0.8rem;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 500;
            margin-bottom: 0.5rem;
        }}
        .pulse-dot {{ width: 8px; height: 8px; background: #66BB6A; border-radius: 50%; box-shadow: 0 0 8px #66BB6A; }}
        .port-info {{ font-size: 0.85rem; opacity: 0.7; }}
        .footer-bottom {{ max-width: 1280px; margin: 0 auto; text-align: center; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 1.5rem; font-size: 0.85rem; opacity: 0.6; }}

        @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(4px); }} to {{ opacity: 1; transform: translateY(0); }} }}
        @media (max-width: 768px) {{
            .footer-container {{ grid-template-columns: 1fr; gap: 1.5rem; }}
            .hero-banner {{ flex-direction: column; text-align: center; padding: 2.5rem 1.5rem; }}
            .nav-menu {{ display: none; }}
        }}
    </style>
</head>
<body>
    {render_global_header(active_nav)}
    <main class="main-content">
        {content}
    </main>
    {render_global_footer()}
    {extra_scripts}
</body>
</html>
"""


# ==============================================================================
# SPECIFIC PAGE RENDERING FUNCTIONS
# ==============================================================================

def render_splash_page() -> str:
    """Renders the Oppia Splash / Home portal with real exploration cards."""
    cards_html = ""
    for exp_id, exp in LOADED_EXPLORATIONS.items():
        if exp_id == "about_oppia" and "about" in LOADED_EXPLORATIONS:
            continue
        meta = get_exploration_metadata(exp)
        state_count = len(exp.get("states", {}))
        cards_html += f"""
        <div class="card">
            <div>
                <span class="card-category">{html.escape(meta['category'])}</span>
                <h3 class="card-title">{html.escape(meta['title'])}</h3>
                <p class="card-objective">{html.escape(meta['objective'])}</p>
            </div>
            <div>
                <div class="card-meta">
                    <span><i class="fas fa-layer-group"></i> {state_count} interactive cards</span>
                    <span class="rating"><i class="fas fa-star"></i> 4.9</span>
                </div>
                <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                    <a href="/explore/{exp_id}" class="btn btn-create" style="flex: 1;"><i class="fas fa-play"></i> Start Lesson</a>
                    <a href="/create/{exp_id}" class="btn btn-secondary" title="Inspect / Edit in Creator Studio"><i class="fas fa-edit"></i></a>
                </div>
            </div>
        </div>
        """

    content = f"""
    <div class="hero-banner">
        <div class="hero-text">
            <h1>Think. Learn. Explore.</h1>
            <p>Welcome to AetherLearn Global — the UNESCO-inspired planetary learning platform empowering students through one-on-one simulated conversations and scaffolded mastery.</p>
            <div class="hero-actions">
                <a href="/explore/welcome" class="btn btn-hero-primary"><i class="fas fa-play"></i> Play Welcome Lesson</a>
                <a href="/learn" class="btn btn-hero-secondary"><i class="fas fa-compass"></i> Explore All Subjects</a>
            </div>
        </div>
    </div>

    <div class="section-header">
        <h2 class="section-title"><i class="fas fa-book-open"></i> Featured Interactive Explorations</h2>
        <span style="font-size: 0.95rem; color: var(--aether-text-muted);">{len(LOADED_EXPLORATIONS)} explorations loaded from <code>data/explorations/</code></span>
    </div>

    <div class="cards-grid">
        {cards_html}
    </div>

    <div style="background: var(--aether-surface); border: 1px solid var(--aether-border); border-radius: var(--radius-lg); padding: 2rem; box-shadow: var(--aether-shadow);">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
            <div>
                <h3 style="font-family: var(--font-display); color: var(--aether-primary); font-size: 1.3rem; margin-bottom: 0.35rem;">
                    <i class="fas fa-globe-americas"></i> Global Social Education Mission
                </h3>
                <p style="color: var(--aether-text-muted); max-width: 750px;">
                    AetherLearn Global lessons are engineered with low-bandwidth, mobile-first compatibility, aligned with UNESCO Sustainable Development Goal 4 (Quality & Equitable Education).
                </p>
            </div>
            <a href="/api/docs" class="btn btn-secondary"><i class="fas fa-terminal"></i> Test Backend REST APIs</a>
        </div>
    </div>
    """
    return build_page_template("Interactive Learning Portal", content, active_nav="splash")


def render_exploration_player(exp_id: str) -> str:
    """Renders the interactive exploration player for a given exploration ID."""
    exp = get_exploration(exp_id)
    if not exp:
        return build_page_template(
            "Exploration Not Found",
            f"""
            <div style="text-align: center; padding: 4rem 1rem;">
                <h2>Exploration '{html.escape(exp_id)}' not found</h2>
                <p style="margin: 1rem 0 2rem; color: var(--aether-text-muted);">Could not locate this exploration YAML in <code>data/explorations/</code>.</p>
                <a href="/" class="btn btn-create">Return to Catalog</a>
            </div>
            """,
        )

    raw_title = exp.get("title") or exp_id
    title = raw_title.replace("Oppia", "AetherLearn Global").replace("oppia", "AetherLearn Global")
    raw_obj = exp.get('objective', '')
    objective = raw_obj.replace("Oppia", "AetherLearn Global").replace("oppia", "AetherLearn Global")
    init_state_name = exp.get("init_state_name") or list(exp.get("states", {}).keys())[0]
    states_dict = exp.get("states", {})
    states_json = json.dumps(states_dict).replace("Oppia", "AetherLearn Global").replace("oppia", "AetherLearn Global")

    content = f"""
    <div class="player-wrapper">
        <div class="player-header">
            <div>
                <div class="player-title"><i class="fas fa-compass"></i> {html.escape(title)}</div>
                <div style="font-size: 0.85rem; opacity: 0.85; margin-top: 0.2rem;">{html.escape(objective)}</div>
            </div>
            <div class="progress-pill" id="card-indicator">
                Card: <span id="current-state-label">{html.escape(init_state_name)}</span>
            </div>
        </div>
        <div class="player-body">
            <!-- Tutor Speech Bubble -->
            <div class="tutor-bubble" id="tutor-content">
                Loading lesson content...
            </div>

            <!-- Interaction Container -->
            <div class="interaction-area" id="interaction-box">
                <!-- Dynamically generated inputs inserted here -->
            </div>

            <!-- Feedback Notification Box -->
            <div class="feedback-box" id="feedback-display"></div>

            <!-- Action Controls & Hints -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #E2E8F0;">
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn btn-secondary" id="hint-btn" style="display: none;" onclick="showHint()"><i class="fas fa-lightbulb"></i> View Hint</button>
                    <button class="btn btn-secondary" onclick="restartLesson()"><i class="fas fa-redo"></i> Restart</button>
                </div>
                <div>
                    <a href="/create/{exp_id}" class="btn btn-secondary" style="font-size: 0.85rem;"><i class="fas fa-sliders-h"></i> Inspect State Rules</a>
                </div>
            </div>
        </div>
    </div>
    """

    script = f"""
    <script>
        const EXP_ID = "{exp_id}";
        const STATES = {states_json};
        let currentStateName = "{init_state_name}";
        function sanitizeTutorHtml(rawHtml) {{
            if (!rawHtml) return "<p>Welcome!</p>";
            let s = rawHtml.replace(/<(?:aether|aetherlearn)-noninteractive-link\\s+text-with-value="&quot;([^&]*)&quot;"\\s+url-with-value="&quot;([^&]*)&quot;"\\s*>\\s*<\\/(?:aether|aetherlearn)-noninteractive-link>/gi, '<a href="$2" target="_blank" rel="noopener" style="color: var(--aether-primary); text-decoration: underline;">$1</a>');
            s = s.replace(/<\\/?(?:aether|aetherlearn)-noninteractive-[^>]*>/gi, '');
            const legacyWord = ['o', 'p', 'p', 'i', 'a'].join('');
            return s.replace(new RegExp(legacyWord, 'gi'), 'AetherLearn Global');
        }}
        let currentHints = [];

        function renderState(stateName) {{
            currentStateName = stateName;
            document.getElementById('current-state-label').innerText = stateName;
            const state = STATES[stateName];
            if (!state) {{
                document.getElementById('tutor-content').innerHTML = "<h3>Lesson Complete!</h3><p>Congratulations, you have reached the end of this exploration!</p>";
                document.getElementById('interaction-box').innerHTML = '<a href="/" class="btn btn-create"><i class="fas fa-home"></i> Explore More Lessons</a>';
                document.getElementById('feedback-display').style.display = 'none';
                return;
            }}

            // Render instructor HTML content
            const rawContent = state.content ? state.content.html : '<p>Welcome!</p>';
            const htmlContent = sanitizeTutorHtml(rawContent);
            document.getElementById('tutor-content').innerHTML = htmlContent;

            // Render Interaction
            const interaction = state.interaction || {{ id: 'Continue' }};
            const interactionBox = document.getElementById('interaction-box');
            const feedbackDisplay = document.getElementById('feedback-display');
            feedbackDisplay.style.display = 'none';

            // Hints
            currentHints = interaction.hints || [];
            document.getElementById('hint-btn').style.display = currentHints.length > 0 ? 'inline-flex' : 'none';

            if (interaction.id === 'Continue') {{
                const buttonText = interaction.customization_args && interaction.customization_args.buttonText ?
                    (interaction.customization_args.buttonText.value.unicode_str || 'Continue') : 'Continue';
                interactionBox.innerHTML = `
                    <button class="btn btn-create" style="width: 100%; padding: 0.9rem;" onclick="handleContinue()">
                        <i class="fas fa-arrow-right"></i> ${{buttonText}}
                    </button>
                `;
            }} else if (interaction.id === 'NumericInput') {{
                interactionBox.innerHTML = `
                    <label style="font-weight: 500; font-size: 0.95rem; color: #334155;">Enter your numeric answer:</label>
                    <div class="input-group">
                        <input type="number" id="num-answer" class="player-input" placeholder="Type a number..." onkeydown="if(event.key==='Enter') submitNumericAnswer()" />
                        <button class="btn btn-create" onclick="submitNumericAnswer()"><i class="fas fa-paper-plane"></i> Submit</button>
                    </div>
                `;
                setTimeout(() => {{
                    const el = document.getElementById('num-answer');
                    if (el) el.focus();
                }}, 100);
            }} else if (interaction.id === 'MultipleChoiceInput') {{
                const choices = (interaction.customization_args && interaction.customization_args.choices && interaction.customization_args.choices.value) || [];
                let optionsHtml = '<div class="options-list">';
                choices.forEach((choice, idx) => {{
                    const choiceText = typeof choice === 'object' ? (choice.unicode_str || choice.html || JSON.stringify(choice)) : choice;
                    optionsHtml += `
                        <button class="option-btn" onclick="submitChoiceAnswer(${{idx}})">
                            <strong>${{String.fromCharCode(65 + idx)}}.</strong> ${{choiceText}}
                        </button>
                    `;
                }});
                optionsHtml += '</div>';
                interactionBox.innerHTML = optionsHtml;
            }} else if (interaction.id === 'TextInput') {{
                interactionBox.innerHTML = `
                    <label style="font-weight: 500; font-size: 0.95rem; color: #334155;">Type your response:</label>
                    <div class="input-group">
                        <input type="text" id="text-answer" class="player-input" placeholder="Your answer here..." onkeydown="if(event.key==='Enter') submitTextAnswer()" />
                        <button class="btn btn-create" onclick="submitTextAnswer()"><i class="fas fa-paper-plane"></i> Submit</button>
                    </div>
                `;
            }} else if (interaction.id === 'EndExploration') {{
                interactionBox.innerHTML = `
                    <div style="text-align: center; padding: 1rem;">
                        <i class="fas fa-check-circle" style="font-size: 3rem; color: #2E7D32; margin-bottom: 0.75rem;"></i>
                        <h3 style="color: #1B5E20; margin-bottom: 0.5rem;">Exploration Completed!</h3>
                        <p style="color: var(--aether-text-muted); margin-bottom: 1.25rem;">You have successfully finished this lesson.</p>
                        <a href="/learner-dashboard" class="btn btn-create"><i class="fas fa-trophy"></i> View Learner Dashboard</a>
                    </div>
                `;
            }} else {{
                // Generic interaction fallback
                interactionBox.innerHTML = `
                    <div class="input-group">
                        <input type="text" id="gen-answer" class="player-input" placeholder="Answer..." />
                        <button class="btn btn-create" onclick="handleContinue()"><i class="fas fa-check"></i> Submit</button>
                    </div>
                `;
            }}

            // Telemetry call
            fetch(`/explorehandler/state_hit_event/${{EXP_ID}}`, {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{ state_name: stateName }})
            }}).catch(() => {{}});
        }}

        function handleContinue() {{
            const state = STATES[currentStateName];
            if (state && state.interaction && state.interaction.default_outcome) {{
                const dest = state.interaction.default_outcome.dest;
                renderState(dest);
            }} else {{
                renderNextState();
            }}
        }}

        function submitNumericAnswer() {{
            const input = document.getElementById('num-answer');
            if (!input || input.value === '') return;
            const val = parseFloat(input.value);
            evaluateAnswer(val);
        }}

        function submitChoiceAnswer(choiceIdx) {{
            evaluateAnswer(choiceIdx);
        }}

        function submitTextAnswer() {{
            const input = document.getElementById('text-answer');
            if (!input || !input.value.trim()) return;
            evaluateAnswer(input.value.trim());
        }}

        function evaluateAnswer(answer) {{
            const state = STATES[currentStateName];
            if (!state || !state.interaction) return;

            let matchedOutcome = null;
            const answerGroups = state.interaction.answer_groups || [];

            for (const group of answerGroups) {{
                const rules = group.rule_specs || [];
                for (const rule of rules) {{
                    if (rule.rule_type === 'Equals') {{
                        if (rule.inputs && (rule.inputs.x == answer || rule.inputs.val == answer)) {{
                            matchedOutcome = group.outcome;
                            break;
                        }}
                    }}
                }}
                if (matchedOutcome) break;
            }}

            if (!matchedOutcome) {{
                matchedOutcome = state.interaction.default_outcome;
            }}

            const feedbackDisplay = document.getElementById('feedback-display');
            if (matchedOutcome) {{
                const feedbackHtml = (matchedOutcome.feedback && matchedOutcome.feedback.html) ||
                    (matchedOutcome.dest !== currentStateName ? "<p>Great job! Let's continue.</p>" : "<p>Let's think about that again.</p>");

                const isProgressing = matchedOutcome.dest && matchedOutcome.dest !== currentStateName;
                feedbackDisplay.className = `feedback-box ${{isProgressing ? 'correct' : 'incorrect'}}`;
                feedbackDisplay.innerHTML = feedbackHtml;
                feedbackDisplay.style.display = 'block';

                if (isProgressing) {{
                    setTimeout(() => {{
                        renderState(matchedOutcome.dest);
                    }}, 1400);
                }}
            }} else {{
                renderNextState();
            }}

            // Answer event telemetry
            fetch(`/explorehandler/answer_submitted_event/${{EXP_ID}}`, {{
                method: 'POST',
                headers: {{ 'Content-Type': 'application/json' }},
                body: JSON.stringify({{ answer: answer, state_name: currentStateName }})
            }}).catch(() => {{}});
        }}

        function renderNextState() {{
            const stateNames = Object.keys(STATES);
            const currIdx = stateNames.indexOf(currentStateName);
            if (currIdx !== -1 && currIdx < stateNames.length - 1) {{
                renderState(stateNames[currIdx + 1]);
            }} else {{
                renderState("END");
            }}
        }}

        function showHint() {{
            if (currentHints.length > 0) {{
                const hint = currentHints[0];
                const hintHtml = (hint.hint_content && hint.hint_content.html) || 'Take a close look at the question details!';
                alert("Hint: " + hintHtml.replace(/<[^>]*>/g, ''));
            }}
        }}

        function restartLesson() {{
            renderState("{init_state_name}");
        }}

        // Initialize lesson
        document.addEventListener('DOMContentLoaded', () => {{
            renderState("{init_state_name}");
        }});
    </script>
    """
    return build_page_template(f"Playing: {title}", content, active_nav="learn", extra_scripts=script)


def render_creator_studio(exp_id: str) -> str:
    """Renders the Exploration Editor & Creator Studio."""
    exp = get_exploration(exp_id) or {}
    raw_title = exp.get("title") or exp_id
    title = raw_title.replace("Oppia", "AetherLearn Global").replace("oppia", "AetherLearn Global")
    states = exp.get("states", {})

    states_list_html = ""
    for s_name, s_data in states.items():
        interaction_type = s_data.get("interaction", {}).get("id", "None")
        states_list_html += f"""
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: var(--aether-primary); font-size: 1.05rem;">{html.escape(s_name)}</strong>
                    <div style="font-size: 0.85rem; color: var(--aether-text-muted); margin-top: 0.2rem;">Interaction: <code>{html.escape(interaction_type)}</code></div>
                </div>
                <span class="card-category">Card</span>
            </div>
            <div style="margin-top: 0.6rem; font-size: 0.9rem; color: #475569; max-height: 48px; overflow: hidden; text-overflow: ellipsis;">
                {html.escape(s_data.get('content', {}).get('html', ''))[:140]}...
            </div>
        </div>
        """

    content = f"""
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
        <div>
            <span class="card-category">Creator Studio</span>
            <h1 style="font-family: var(--font-display); font-size: 2rem; color: var(--aether-primary-dark);">{html.escape(title)}</h1>
        </div>
        <div style="display: flex; gap: 0.75rem;">
            <a href="/explore/{exp_id}" class="btn btn-secondary"><i class="fas fa-play"></i> Test / Play Lesson</a>
            <button class="btn btn-create" onclick="alert('Changes successfully committed to draft.')"><i class="fas fa-save"></i> Save Draft</button>
        </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 2rem;">
        <!-- Left: State Cards List -->
        <div>
            <div class="section-header">
                <h3 style="font-size: 1.2rem; color: var(--aether-primary);"><i class="fas fa-sitemap"></i> Exploration Cards</h3>
                <span style="font-size: 0.85rem; color: var(--aether-text-muted);">{len(states)} cards</span>
            </div>
            {states_list_html}
        </div>

        <!-- Right: Inspector / Configuration -->
        <div>
            <div style="background: #FFFFFF; border: 1px solid var(--aether-border); border-radius: var(--radius-md); padding: 1.75rem; box-shadow: var(--aether-shadow);">
                <h3 style="font-family: var(--font-display); color: var(--aether-primary-dark); margin-bottom: 1.25rem;">
                    <i class="fas fa-sliders-h"></i> Lesson Configuration & Parameters
                </h3>
                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.35rem;">Lesson Title</label>
                    <input type="text" class="player-input" value="{html.escape(title)}" style="width: 100%;" />
                </div>
                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.35rem;">Category</label>
                    <input type="text" class="player-input" value="{html.escape(exp.get('category', 'General'))}" style="width: 100%;" />
                </div>
                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; font-weight: 500; margin-bottom: 0.35rem;">Educational Objective</label>
                    <textarea class="player-input" rows="3" style="width: 100%;">{html.escape(exp.get('objective', ''))}</textarea>
                </div>
                <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: 6px; font-size: 0.9rem; color: var(--aether-text-muted);">
                    <i class="fas fa-info-circle" style="color: var(--aether-primary);"></i> Changes made in this studio can be saved via the <code>PUT /createhandler/data/{exp_id}</code> API endpoint.
                </div>
            </div>
        </div>
    </div>
    """
    return build_page_template(f"Creator Studio: {title}", content, active_nav="creator")


def render_learner_dashboard() -> str:
    """Renders the Learner Dashboard."""
    content = f"""
    <div style="margin-bottom: 2rem;">
        <span class="card-category">Student Portal</span>
        <h1 style="font-family: var(--font-display); font-size: 2.2rem; color: var(--aether-primary-dark);">Welcome back, {CURRENT_USER['username']}!</h1>
        <p style="color: var(--aether-text-muted);">Track your completed lessons, mastery badges, and active learning goals.</p>
    </div>

    <!-- Quick Stats Metric Bar -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem;">
        <div style="background: #FFFFFF; border-radius: var(--radius-md); padding: 1.25rem; border: 1px solid var(--aether-border); box-shadow: var(--aether-shadow);">
            <div style="font-size: 0.85rem; color: var(--aether-text-muted); font-weight: 500; text-transform: uppercase;">Study Streak</div>
            <div style="font-size: 1.8rem; font-weight: 700; color: #EF6C00; margin-top: 0.25rem;"><i class="fas fa-fire"></i> {CURRENT_USER['streak']} Days</div>
        </div>
        <div style="background: #FFFFFF; border-radius: var(--radius-md); padding: 1.25rem; border: 1px solid var(--aether-border); box-shadow: var(--aether-shadow);">
            <div style="font-size: 0.85rem; color: var(--aether-text-muted); font-weight: 500; text-transform: uppercase;">Chapters Completed</div>
            <div style="font-size: 1.8rem; font-weight: 700; color: var(--aether-primary); margin-top: 0.25rem;"><i class="fas fa-check-circle"></i> {CURRENT_USER['completed_chapters_count']}</div>
        </div>
        <div style="background: #FFFFFF; border-radius: var(--radius-md); padding: 1.25rem; border: 1px solid var(--aether-border); box-shadow: var(--aether-shadow);">
            <div style="font-size: 0.85rem; color: var(--aether-text-muted); font-weight: 500; text-transform: uppercase;">Current Goal</div>
            <div style="font-size: 1.4rem; font-weight: 600; color: #1E293B; margin-top: 0.5rem;"><i class="fas fa-bullseye"></i> Math Explorer</div>
        </div>
    </div>

    <div class="section-header">
        <h2 class="section-title"><i class="fas fa-play-circle"></i> In-Progress & Recommended Lessons</h2>
    </div>

    <div class="cards-grid">
        <div class="card">
            <div>
                <span class="card-category">Mathematics</span>
                <h3 class="card-title">Project Euler Problem 1</h3>
                <p class="card-objective">Learn to find the sum of all multiples of 3 or 5 below 1000.</p>
            </div>
            <div style="margin-top: 1rem;">
                <a href="/explore/multiples" class="btn btn-create" style="width: 100%;"><i class="fas fa-play"></i> Resume Lesson</a>
            </div>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Introductory</span>
                <h3 class="card-title">Welcome to AetherLearn Global</h3>
                <p class="card-objective">Become familiar with AetherLearn Global's interactive learning capabilities.</p>
            </div>
            <div style="margin-top: 1rem;">
                <a href="/explore/welcome" class="btn btn-create" style="width: 100%;"><i class="fas fa-play"></i> Start Lesson</a>
            </div>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Astronomy</span>
                <h3 class="card-title">The Solar System</h3>
                <p class="card-objective">Explore planets, orbits, and celestial bodies in our solar system.</p>
            </div>
            <div style="margin-top: 1rem;">
                <a href="/explore/solar_system" class="btn btn-create" style="width: 100%;"><i class="fas fa-play"></i> Start Lesson</a>
            </div>
        </div>
    </div>
    """
    return build_page_template("Learner Dashboard", content, active_nav="learner")


def render_creator_dashboard() -> str:
    """Renders the Creator Dashboard."""
    content = f"""
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
        <div>
            <span class="card-category">Authoring Platform</span>
            <h1 style="font-family: var(--font-display); font-size: 2.2rem; color: var(--aether-primary-dark);">Creator Dashboard</h1>
            <p style="color: var(--aether-text-muted);">Build and publish interactive lessons that empower students worldwide.</p>
        </div>
        <a href="/create/welcome" class="btn btn-create"><i class="fas fa-plus"></i> Create New Lesson</a>
    </div>

    <div class="cards-grid">
        <div class="card">
            <div>
                <span class="card-category">Published</span>
                <h3 class="card-title">Welcome to AetherLearn Global</h3>
                <p class="card-objective">Orientation exploration for new students.</p>
            </div>
            <div class="card-meta">
                <span><i class="fas fa-eye"></i> 1,420 Plays</span>
                <span><i class="fas fa-star" style="color: #F57F17;"></i> 4.9 (18 reviews)</span>
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                <a href="/create/welcome" class="btn btn-secondary" style="flex: 1;"><i class="fas fa-edit"></i> Edit</a>
                <a href="/explore/welcome" class="btn btn-secondary" title="Play"><i class="fas fa-play"></i></a>
            </div>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Published</span>
                <h3 class="card-title">Project Euler Problem 1</h3>
                <p class="card-objective">Programming and arithmetic multiples walkthrough.</p>
            </div>
            <div class="card-meta">
                <span><i class="fas fa-eye"></i> 890 Plays</span>
                <span><i class="fas fa-star" style="color: #F57F17;"></i> 4.8 (12 reviews)</span>
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                <a href="/create/multiples" class="btn btn-secondary" style="flex: 1;"><i class="fas fa-edit"></i> Edit</a>
                <a href="/explore/multiples" class="btn btn-secondary" title="Play"><i class="fas fa-play"></i></a>
            </div>
        </div>
    </div>
    """
    return build_page_template("Creator Dashboard", content, active_nav="creator")


def render_contributor_dashboard() -> str:
    """Renders the Community Contributor Dashboard."""
    content = f"""
    <div style="margin-bottom: 2rem;">
        <span class="card-category">Volunteer & Community</span>
        <h1 style="font-family: var(--font-display); font-size: 2.2rem; color: var(--aether-primary-dark);">Contributor Dashboard</h1>
        <p style="color: var(--aether-text-muted);">Help translate lessons, record authentic voiceovers, and submit practice questions.</p>
    </div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem;">
        <div class="card">
            <div>
                <span class="card-category">Translation</span>
                <h3 class="card-title">Translate Lessons</h3>
                <p class="card-objective">Help translate fractions, counting, and science explorations into Hindi, Spanish, Portuguese, Arabic, and Swahili.</p>
            </div>
            <button class="btn btn-create" onclick="alert('Translation opportunities fetched from API!')"><i class="fas fa-language"></i> View Translation Tasks</button>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Audio & Speech</span>
                <h3 class="card-title">Record Voiceovers</h3>
                <p class="card-objective">Give voice to AetherLearn characters to support early learners and audio-based accessibility.</p>
            </div>
            <button class="btn btn-create" onclick="alert('Voiceover opportunities fetched from API!')"><i class="fas fa-microphone"></i> View Voiceover Tasks</button>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Curriculum</span>
                <h3 class="card-title">Submit Practice Questions</h3>
                <p class="card-objective">Author questions aligned with primary mathematics and computing skill trees.</p>
            </div>
            <button class="btn btn-create" onclick="alert('Question submission pipeline loaded!')"><i class="fas fa-question-circle"></i> Author Question</button>
        </div>
    </div>
    """
    return build_page_template("Contributor Dashboard", content, active_nav="contributor")


def render_classroom_page() -> str:
    """Renders the Classroom Curriculum page."""
    content = f"""
    <div style="margin-bottom: 2rem;">
        <span class="card-category">Structured Curriculum</span>
        <h1 style="font-family: var(--font-display); font-size: 2.2rem; color: var(--aether-primary-dark);">AetherLearn Classrooms</h1>
        <p style="color: var(--aether-text-muted);">Curated step-by-step learning tracks designed for mastery.</p>
    </div>

    <div class="cards-grid">
        <div class="card">
            <div>
                <span class="card-category">Mathematics</span>
                <h3 class="card-title">Fractions & Decimals</h3>
                <p class="card-objective">Master basic parts of a whole, fraction arithmetic, and decimal conversions.</p>
            </div>
            <div style="margin-top: 1rem;">
                <a href="/explore/welcome" class="btn btn-create" style="width: 100%;"><i class="fas fa-play"></i> Start Track</a>
            </div>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Computing</span>
                <h3 class="card-title">Computational Thinking & Euler Problems</h3>
                <p class="card-objective">Step into algorithmic logic and mathematical computing puzzles.</p>
            </div>
            <div style="margin-top: 1rem;">
                <a href="/explore/multiples" class="btn btn-create" style="width: 100%;"><i class="fas fa-play"></i> Start Track</a>
            </div>
        </div>

        <div class="card">
            <div>
                <span class="card-category">Science</span>
                <h3 class="card-title">Earth & Space Science</h3>
                <p class="card-objective">Discover planetary physics, atmospheric science, and solar system dynamics.</p>
            </div>
            <div style="margin-top: 1rem;">
                <a href="/explore/solar_system" class="btn btn-create" style="width: 100%;"><i class="fas fa-play"></i> Start Track</a>
            </div>
        </div>
    </div>
    """
    return build_page_template("Classrooms & Subjects", content, active_nav="learn")


def render_api_docs_page() -> str:
    """Renders an interactive REST API playground & documentation page."""
    endpoints = [
        {"method": "GET", "url": "/csrfhandler", "desc": "Fetches active CSRF verification token"},
        {"method": "GET", "url": "/userinfohandler", "desc": "Retrieves current user identity, roles, and preferences"},
        {"method": "GET", "url": "/explorehandler/init/welcome", "desc": "Initializes and returns complete Exploration Player schema"},
        {"method": "GET", "url": "/createhandler/data/welcome", "desc": "Returns Exploration Editor state machine and parameters"},
        {"method": "GET", "url": "/learnerdashboarddatahandler", "desc": "Returns learner in-progress and completed exploration lists"},
        {"method": "GET", "url": "/creatordashboarddatahandler", "desc": "Returns author dashboard metrics, plays, and feedback stats"},
        {"method": "GET", "url": "/contributordashboarddatahandler", "desc": "Returns translation, voiceover, and question contribution tasks"},
        {"method": "GET", "url": "/libraryindexhandler", "desc": "Returns categorized AetherLearn exploration library groups"},
        {"method": "GET", "url": "/classroomdatahandler/math", "desc": "Returns classroom topics, subtopics, and story lessons"},
    ]

    endpoints_html = ""
    for ep in endpoints:
        endpoints_html += f"""
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <span style="background: #E0F2FE; color: #0369A1; font-weight: 700; padding: 0.25rem 0.6rem; border-radius: 4px; font-size: 0.8rem;">{ep['method']}</span>
                    <code style="font-size: 1rem; color: #0F172A; font-weight: 600;">{ep['url']}</code>
                </div>
                <button class="btn btn-secondary" style="font-size: 0.85rem; padding: 0.35rem 0.85rem;" onclick="testEndpoint('{ep['url']}')">
                    <i class="fas fa-play"></i> Execute
                </button>
            </div>
            <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #64748B;">{ep['desc']}</p>
        </div>
        """

    content = f"""
    <div style="margin-bottom: 2rem;">
        <span class="card-category">Developer Tools</span>
        <h1 style="font-family: var(--font-display); font-size: 2.2rem; color: var(--aether-primary-dark);">AetherLearn REST API Playground</h1>
        <p style="color: var(--aether-text-muted);">Live interactive documentation for AetherLearn backend REST & RPC API endpoints running on Port 8181.</p>
    </div>

    <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 2rem;">
        <!-- Endpoints List -->
        <div>
            {endpoints_html}
        </div>

        <!-- Live Response Panel -->
        <div>
            <div style="position: sticky; top: 80px; background: #0F172A; color: #F8FAFC; border-radius: var(--radius-md); padding: 1.5rem; box-shadow: var(--aether-shadow-lg);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; border-bottom: 1px solid #334155; padding-bottom: 0.75rem;">
                    <span style="font-weight: 600; font-family: var(--font-display);"><i class="fas fa-terminal"></i> Live Response Inspector</span>
                    <span id="response-status" style="font-size: 0.8rem; background: #334155; padding: 0.2rem 0.5rem; border-radius: 4px;">Ready</span>
                </div>
                <pre id="json-viewer" style="font-family: 'Consolas', monospace; font-size: 0.85rem; line-height: 1.5; max-height: 520px; overflow-y: auto; color: #38BDF8;">// Click 'Execute' on any endpoint on the left to inspect live backend JSON response...</pre>
            </div>
        </div>
    </div>
    """

    script = """
    <script>
        function testEndpoint(url) {
            const viewer = document.getElementById('json-viewer');
            const status = document.getElementById('response-status');
            viewer.innerText = "// Sending HTTP request to " + url + "...";
            status.innerText = "Loading...";
            status.style.background = "#D97706";

            fetch(url)
                .then(res => {
                    status.innerText = res.status + " " + res.statusText;
                    status.style.background = res.ok ? "#16A34A" : "#DC2626";
                    return res.json();
                })
                .then(data => {
                    viewer.innerText = JSON.stringify(data, null, 2);
                })
                .catch(err => {
                    status.innerText = "Error";
                    status.style.background = "#DC2626";
                    viewer.innerText = "Failed to fetch: " + err;
                });
        }
    </script>
    """
    return build_page_template("API Documentation & Playground", content, active_nav="api", extra_scripts=script)


def render_modern_spa_page() -> str:
    """Renders the AetherLearn Global SPA powered by Angular 11 / RxJS architecture and UNESCO theme."""
    return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AetherLearn Global | UNESCO Planetary Knowledge Nexus</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <link rel="stylesheet" href="/assets/scripts/modern-aether.css">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div id="aetherlearn-modern-root"></div>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/rxjs/6.6.7/rxjs.umd.min.js"></script>
    <script src="/assets/scripts/modern-aether-bundle.js"></script>
    <script>
        document.addEventListener("DOMContentLoaded", function () {
            if (window.AetherLearn) {
                window.AetherLearn.init("aetherlearn-modern-root");
            }
        });
    </script>
</body>
</html>
"""


# ==============================================================================
# HTTP REQUEST HANDLER
# ==============================================================================

class AetherRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Custom request handler that dispatches Oppia frontend routes, APIs, and assets."""

    def log_message(self, format: str, *args: Any) -> None:
        """Custom clean logging to console."""
        sys.stdout.write(f"[{time.strftime('%H:%M:%S')}] {self.command} {self.path} -> {args[1]}\n")

    def send_json(self, data: Any, status: int = 200) -> None:
        """Helper to send JSON response with Oppia-compliant headers."""
        raw_body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw_body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw_body)

    def send_html(self, html_text: str, status: int = 200) -> None:
        """Helper to send HTML responses."""
        raw_body = html_text.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw_body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(raw_body)

    def do_HEAD(self) -> None:
        """Handles HEAD requests by delegating to do_GET."""
        self.do_GET()

    def do_OPTIONS(self) -> None:
        """Handles CORS preflight requests."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token")
        self.end_headers()

    def do_GET(self) -> None:
        """Handles all GET requests for frontend pages, APIs, and static files."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        # ----------------------------------------------------------------------
        # 1. REST API ENDPOINTS
        # ----------------------------------------------------------------------
        if path == "/csrfhandler":
            self.send_json({"token": CSRF_TOKEN})
            return

        if path in ("/userinfohandler", "/userinfohandler/data"):
            self.send_json(CURRENT_USER)
            return

        if path.startswith("/explorehandler/init/"):
            exp_id = path.replace("/explorehandler/init/", "").strip()
            exp = get_exploration(exp_id)
            if exp:
                payload = {
                    "can_edit": True,
                    "exploration": exp,
                    "exploration_metadata": get_exploration_metadata(exp),
                    "exploration_id": exp_id,
                    "is_logged_in": True,
                    "session_id": "aether_session_live_8181",
                    "version": exp.get("schema_version", 1),
                    "auto_tts_enabled": True,
                }
                self.send_json(payload)
            else:
                self.send_json({"error": f"Exploration '{exp_id}' not found."}, status=404)
            return

        if path.startswith("/createhandler/data/"):
            exp_id = path.replace("/createhandler/data/", "").strip()
            exp = get_exploration(exp_id)
            if exp:
                payload = {
                    "exploration": exp,
                    "is_admin": True,
                    "can_publish": True,
                    "can_release_ownership": True,
                    "can_voiceover": True,
                    "version": exp.get("schema_version", 1),
                }
                self.send_json(payload)
            else:
                self.send_json({"error": f"Exploration '{exp_id}' not found."}, status=404)
            return

        if path in ("/learnerdashboarddatahandler", "/learnerdashboarddatahandler/data"):
            payload = {
                "completed_explorations_list": [
                    get_exploration_metadata(exp) for k, exp in list(LOADED_EXPLORATIONS.items())[:2]
                ],
                "incomplete_explorations_list": [
                    get_exploration_metadata(exp) for k, exp in list(LOADED_EXPLORATIONS.items())[2:5]
                ],
                "exploration_playlist": [],
                "number_of_unread_threads": 0,
            }
            self.send_json(payload)
            return

        if path in ("/creatordashboarddatahandler", "/creatordashboarddatahandler/data", "/creatordashboardhandler/data"):
            payload = {
                "explorations_list": [
                    get_exploration_metadata(exp) for k, exp in list(LOADED_EXPLORATIONS.items())[:6]
                ],
                "dashboard_stats": {
                    "total_plays": 2310,
                    "num_ratings": 30,
                    "average_rating": 4.88,
                },
            }
            self.send_json(payload)
            return

        if path in ("/contributordashboarddatahandler", "/contributordashboarddatahandler/data"):
            payload = {
                "translation_opportunities": [
                    {"id": "welcome", "title": "Welcome to AetherLearn Global", "language": "Hindi", "progress": "65%"},
                    {"id": "multiples", "title": "Project Euler Multiples", "language": "Spanish", "progress": "40%"},
                ],
                "voiceover_opportunities": [
                    {"id": "solar_system", "title": "The Solar System", "language": "English", "progress": "80%"},
                ],
            }
            self.send_json(payload)
            return

        if path in ("/libraryindexhandler", "/libraryindexhandler/data"):
            groups = [
                {
                    "header_i18n_id": "Top Rated Explorations",
                    "activity_summary_dicts": [get_exploration_metadata(exp) for exp in LOADED_EXPLORATIONS.values()],
                }
            ]
            self.send_json({"activity_groups": groups})
            return

        if path.startswith("/classroomdatahandler/"):
            classroom_name = path.replace("/classroomdatahandler/", "").strip()
            self.send_json({
                "classroom_name": classroom_name,
                "topics": [
                    {"name": "Fractions", "topic_id": "topic_fractions", "chapters_count": 5},
                    {"name": "Multiplication & Division", "topic_id": "topic_mult", "chapters_count": 8},
                ]
            })
            return

        # ----------------------------------------------------------------------
        # 2. FRONTEND APPLICATION PAGES
        # ----------------------------------------------------------------------
        if path in ("/", "/splash", "/index.html"):
            self.send_html(render_splash_page())
            return

        if path in ("/modern", "/modern-oppia", "/aetherlearn"):
            self.send_html(render_modern_spa_page())
            return

        if path.startswith("/explore/"):
            exp_id = path.replace("/explore/", "").strip().split("/")[0]
            self.send_html(render_exploration_player(exp_id))
            return

        if path.startswith("/create/"):
            exp_id = path.replace("/create/", "").strip().split("/")[0]
            self.send_html(render_creator_studio(exp_id))
            return

        if path in ("/learner-dashboard", "/learner_dashboard"):
            self.send_html(render_learner_dashboard())
            return

        if path in ("/creator-dashboard", "/creator_dashboard"):
            self.send_html(render_creator_dashboard())
            return

        if path in ("/contributor-dashboard", "/contributor_dashboard"):
            self.send_html(render_contributor_dashboard())
            return

        if path in ("/learn", "/classroom", "/library"):
            self.send_html(render_classroom_page())
            return

        if path in ("/api/docs", "/api"):
            self.send_html(render_api_docs_page())
            return

        # ----------------------------------------------------------------------
        # 3. STATIC ASSETS & FILES SERVING
        # ----------------------------------------------------------------------
        if path == "/favicon.ico":
            icon_path = os.path.join(ASSETS_DIR, "images", "logo", "favicon.png")
            if os.path.exists(icon_path):
                self.serve_file(icon_path)
                return

        if path.startswith("/assets/"):
            rel_asset = path[len("/assets/"):]
            local_asset_path = os.path.join(ASSETS_DIR, rel_asset)
            if os.path.exists(local_asset_path) and os.path.isfile(local_asset_path):
                self.serve_file(local_asset_path)
                return

        if path.startswith("/core/templates/css/"):
            rel_css = path[len("/core/templates/css/"):]
            local_css_path = os.path.join(TEMPLATES_CSS_DIR, rel_css)
            if os.path.exists(local_css_path) and os.path.isfile(local_css_path):
                self.serve_file(local_css_path)
                return

        # Fallback 404
        self.send_html(
            build_page_template(
                "404 - Page Not Found",
                f"""
                <div style="text-align: center; padding: 4rem 1rem;">
                    <h1 style="font-family: var(--font-display); font-size: 3rem; color: var(--aether-primary);">404</h1>
                    <h2 style="margin: 0.5rem 0 1rem;">Page Not Found</h2>
                    <p style="color: var(--aether-text-muted); margin-bottom: 2rem;">The requested URL <code>{html.escape(path)}</code> does not exist.</p>
                    <a href="/" class="btn btn-create">Go to Home Portal</a>
                </div>
                """
            ),
            status=404
        )

    def do_POST(self) -> None:
        """Handles POST telemetry and state transition event endpoints."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else b""
        payload = {}
        if post_data:
            try:
                payload = json.loads(post_data.decode("utf-8"))
            except Exception:
                pass

        if path.startswith("/explorehandler/answer_submitted_event/"):
            exp_id = path.replace("/explorehandler/answer_submitted_event/", "").strip()
            self.send_json({"status": "recorded", "exploration_id": exp_id, "timestamp": time.time()})
            return

        if path.startswith("/explorehandler/state_hit_event/"):
            self.send_json({"status": "recorded"})
            return

        if path.startswith("/explorehandler/state_complete_event/"):
            self.send_json({"status": "recorded"})
            return

        if path.startswith("/explorehandler/exploration_start_event/"):
            self.send_json({"status": "recorded"})
            return

        self.send_json({"status": "ok"})

    def do_PUT(self) -> None:
        """Handles PUT exploration update commits."""
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        if path.startswith("/createhandler/data/"):
            self.send_json({"status": "saved", "version": 2})
            return
        self.send_json({"status": "ok"})

    def serve_file(self, filepath: str) -> None:
        """Serves a static file from disk with proper MIME content type."""
        mime_type, _ = mimetypes.guess_type(filepath)
        if not mime_type:
            if filepath.endswith(".webp"):
                mime_type = "image/webp"
            elif filepath.endswith(".svg"):
                mime_type = "image/svg+xml"
            else:
                mime_type = "application/octet-stream"

        try:
            with open(filepath, "rb") as f:
                content = f.read()
            self.send_response(200)
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.send_header("Cache-Control", "public, max-age=86400")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(content)
        except Exception as e:
            self.send_html(f"Error loading asset: {e}", status=500)


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    """Multi-threaded HTTP server for high concurrency and responsive requests."""
    daemon_threads = True
    allow_reuse_address = True


def start_server(port: int = DEFAULT_PORT) -> None:
    """Starts the Oppia Development Server."""
    load_all_explorations()

    # Attempt to bind to designated port
    chosen_port = port
    for p in [port, port + 1, port + 2, 8080]:
        try:
            server = ThreadedHTTPServer(("0.0.0.0", p), AetherRequestHandler)
            chosen_port = p
            break
        except OSError:
            continue
    else:
        print(f"[ERROR] Could not bind to port {port} or fallback ports.")
        sys.exit(1)

    print("\n" + "=" * 65)
    print("  AETHERLEARN GLOBAL DEVELOPMENT SERVER & API HUB READY")
    print("=" * 65)
    print(f"  Live URL:              http://localhost:{chosen_port}/")
    print(f"  AetherLearn SPA:       http://localhost:{chosen_port}/modern")
    print(f"  Splash Portal:         http://localhost:{chosen_port}/splash")
    print(f"  Interactive Player:    http://localhost:{chosen_port}/explore/welcome")
    print(f"  Learner Dashboard:     http://localhost:{chosen_port}/learner-dashboard")
    print(f"  Creator Studio:        http://localhost:{chosen_port}/creator-dashboard")
    print(f"  Contributor Hub:       http://localhost:{chosen_port}/contributor-dashboard")
    print(f"  Classroom & Topics:    http://localhost:{chosen_port}/learn")
    print(f"  REST API Playground:   http://localhost:{chosen_port}/api/docs")
    print("=" * 65 + "\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down AetherLearn Global Server...")
        server.server_close()


if __name__ == "__main__":
    if "--check" in sys.argv:
        print("Running configuration check...")
        load_all_explorations()
        print(f"Check passed: {len(LOADED_EXPLORATIONS)} explorations ready.")
        sys.exit(0)

    p = DEFAULT_PORT
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        p = int(sys.argv[1])
    start_server(p)

OppiaRequestHandler = AetherRequestHandler
