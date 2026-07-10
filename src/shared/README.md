# Shared

Shared code is reusable infrastructure or UI primitives. It must not import
from `app`, `app-shell`, `entities`, or `features`. Do not add abstractions here
until they remove real duplication; feature orchestration belongs with its
feature.
