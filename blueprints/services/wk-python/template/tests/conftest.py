"""Pytest + Hypothesis configuration for the test suite.

Hypothesis is not configured via ``pyproject.toml`` (it has no native TOML
config); settings are applied here through a registered profile so the intent
is actually effective. We disable the per-example *deadline* because property
tests explore large input spaces and per-example timing varies in CI.
"""

from hypothesis import settings

settings.register_profile("ci", deadline=None)
settings.load_profile("ci")
