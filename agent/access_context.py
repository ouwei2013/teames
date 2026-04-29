"""Runtime access context for tenant-aware agent execution."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Optional


@dataclass(frozen=True)
class AccessContext:
    """Identity and authorization boundary for one agent turn/session.

    All fields are optional so personal/local usage remains backward-compatible.
    Enterprise deployments should provide at least ``tenant_id`` and ``user_id``.
    """

    tenant_id: Optional[str] = None
    workspace_id: Optional[str] = None
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    permissions: tuple[str, ...] = field(default_factory=tuple)

    @classmethod
    def coerce(
        cls,
        value: "AccessContext | Mapping[str, Any] | None" = None,
        *,
        tenant_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        user_id: Optional[str] = None,
        agent_id: Optional[str] = None,
    ) -> "AccessContext":
        """Build an AccessContext from an object/dict plus runtime fallbacks."""
        if isinstance(value, cls):
            base = value
        elif isinstance(value, Mapping):
            permissions = value.get("permissions") or ()
            if isinstance(permissions, str):
                permissions = (permissions,)
            base = cls(
                tenant_id=value.get("tenant_id"),
                workspace_id=value.get("workspace_id"),
                user_id=value.get("user_id"),
                agent_id=value.get("agent_id"),
                permissions=tuple(permissions),
            )
        elif value is None:
            base = cls()
        else:
            raise TypeError("access_context must be an AccessContext, mapping, or None")

        return cls(
            tenant_id=base.tenant_id or tenant_id,
            workspace_id=base.workspace_id or workspace_id,
            user_id=base.user_id or user_id,
            agent_id=base.agent_id or agent_id,
            permissions=tuple(base.permissions or ()),
        )

    def is_empty(self) -> bool:
        return not any((self.tenant_id, self.workspace_id, self.user_id, self.agent_id))

    def as_dict(self, *, include_none: bool = False) -> dict[str, Any]:
        data = {
            "tenant_id": self.tenant_id,
            "workspace_id": self.workspace_id,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "permissions": list(self.permissions),
        }
        if include_none:
            return data
        return {k: v for k, v in data.items() if v not in (None, [], ())}

    def session_kwargs(self) -> dict[str, Optional[str]]:
        """Columns to persist on a session row."""
        return {
            "tenant_id": self.tenant_id,
            "workspace_id": self.workspace_id,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
        }
