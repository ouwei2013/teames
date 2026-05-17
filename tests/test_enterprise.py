from enterprise import EnterpriseStore


def test_initialize_tenant_creates_admin_token(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        result = store.initialize_tenant(
            name="Acme",
            tenant_id="acme",
            admin_email="admin@example.com",
            admin_name="Admin User",
        )

        assert result["created"] is True
        assert result["tenant"]["id"] == "acme"
        assert result["admin_api_key"].startswith("hmt_")
        users = store.list_users()
        assert len(users) == 1
        assert users[0]["role"] == "admin"
    finally:
        store.close()


def test_invite_redeem_returns_user_token_and_context(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        invite = store.create_invite(email="user@example.com", role="member")

        redeemed = store.redeem_invite(
            invite["code"],
            email="user@example.com",
            name="User One",
        )

        assert redeemed["api_key"].startswith("hmt_")
        auth = store.authenticate_api_key(redeemed["api_key"])
        assert auth is not None
        ctx = auth["access_context"]
        assert ctx.tenant_id == "acme"
        assert ctx.user_id == redeemed["user"]["id"]
        assert ctx.workspace_id == "default"
        assert redeemed["agents"]
        assert ctx.agent_id == redeemed["agents"][0]["id"]
    finally:
        store.close()


def test_invite_rejects_wrong_email(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        invite = store.create_invite(email="user@example.com")

        try:
            store.redeem_invite(invite["code"], email="other@example.com")
        except ValueError as exc:
            assert "different email" in str(exc)
        else:
            raise AssertionError("expected wrong invite email to fail")
    finally:
        store.close()


def test_invite_scopes_user_to_selected_business_agent(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        default_agent = store.list_agents()[0]
        support_agent = store.create_agent(
            name="Support Agent",
            description="Support for a generic business",
            role_prompt="You answer as the business support team.",
            task_prompt="Answer policy and product questions.",
            knowledge="Return window is 30 days.",
        )
        invite = store.create_invite(
            email="user@example.com",
            role="member",
            agent_ids=[support_agent["id"]],
        )

        redeemed = store.redeem_invite(
            invite["code"],
            email="user@example.com",
            name="User One",
        )
        allowed_ids = [agent["id"] for agent in redeemed["agents"]]
        assert allowed_ids == [support_agent["id"]]

        auth = store.authenticate_api_key(redeemed["api_key"])
        assert auth is not None
        assert auth["access_context"].agent_id == support_agent["id"]
        assert store.resolve_user_agent(auth["user"], support_agent["id"])["id"] == support_agent["id"]

        try:
            store.resolve_user_agent(auth["user"], default_agent["id"])
        except PermissionError as exc:
            assert "not allowed" in str(exc)
        else:
            raise AssertionError("expected default agent access to be denied")

        prompt = store.compile_agent_prompt(support_agent)
        assert "Support Agent" in prompt
        assert "business support team" in prompt
        assert "Return window is 30 days" in prompt
        assert "Do not invent" in prompt
    finally:
        store.close()


def test_social_gateway_invite_binds_external_user_to_agent(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        agent = store.create_agent(
            name="WeChat Support",
            role_prompt="You answer WeChat support questions.",
        )
        invite = store.create_social_gateway_invite(
            agent_id=agent["id"],
            platform="weixin",
            label="Customer QR",
        )

        bound = store.bind_social_gateway_user(
            code=invite["code"],
            platform="weixin",
            bot_account_id="bot_123",
            external_user_id="wx_user_1",
            external_chat_id="wx_chat_1",
            user_name="Customer One",
        )

        assert bound["binding"]["platform"] == "weixin"
        assert bound["binding"]["bot_account_id"] == "bot_123"
        assert bound["user"]["tenant_id"] == "acme"
        assert bound["agent"]["id"] == agent["id"]
        assert bound["access_context"].tenant_id == "acme"
        assert bound["access_context"].user_id == bound["user"]["id"]
        assert bound["access_context"].agent_id == agent["id"]

        resolved = store.resolve_social_gateway_binding(
            platform="weixin",
            bot_account_id="bot_123",
            external_user_id="wx_user_1",
        )
        assert resolved is not None
        assert resolved["user"]["id"] == bound["user"]["id"]
        assert resolved["agent"]["id"] == agent["id"]

        invites = store.list_social_gateway_invites()
        assert invites[0]["uses"] == 1
        bindings = store.list_social_gateway_bindings()
        assert bindings[0]["external_user_id"] == "wx_user_1"
    finally:
        store.close()


def test_social_gateway_invite_rejects_wrong_platform(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        agent = store.list_agents()[0]
        invite = store.create_social_gateway_invite(
            agent_id=agent["id"],
            platform="telegram",
        )

        try:
            store.bind_social_gateway_user(
                code=invite["code"],
                platform="weixin",
                external_user_id="wx_user_1",
            )
        except ValueError as exc:
            assert "different platform" in str(exc)
        else:
            raise AssertionError("expected wrong platform to fail")
    finally:
        store.close()


def test_agent_user_inventory_includes_private_state_counts(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        agent = store.list_agents()[0]
        invite = store.create_invite(email="user@example.com", role="member")
        redeemed = store.redeem_invite(invite["code"], email="user@example.com", name="User One")
        auth = store.authenticate_api_key(redeemed["api_key"])
        assert auth is not None
        user = auth["user"]

        store.set_user_agent_skill(user, agent["id"], "calendar", True)
        store.upsert_user_agent_custom_skill(
            user,
            agent["id"],
            name="private-handbook",
            description="Private handbook",
            content="Only this user can use this handbook.",
            enabled=True,
        )
        device_code = store.create_local_device_code(user, agent["id"], label="Work laptop")
        registered = store.redeem_local_device_code(device_code["code"], device_name="Local Hermes")
        device_auth = store.authenticate_device_token(registered["device_token"])
        assert device_auth is not None

        social_invite = store.create_social_gateway_invite(
            agent_id=agent["id"],
            platform="weixin",
            label="Customer QR",
        )
        bound = store.bind_social_gateway_user(
            code=social_invite["code"],
            platform="weixin",
            bot_account_id="bot_123",
            external_user_id="wx_user_1",
            external_chat_id="wx_chat_1",
            user_name="Customer One",
        )

        users = store.list_agent_users(agent["id"])
        by_id = {item["id"]: item for item in users}
        assert user["id"] in by_id
        assert bound["user"]["id"] in by_id
        assert by_id[user["id"]]["skill_count"] == 1
        assert by_id[user["id"]]["custom_skill_count"] == 1
        assert by_id[user["id"]]["local_device_count"] == 1
        assert by_id[user["id"]]["social_binding_count"] == 0
        assert by_id[user["id"]]["last_seen_at"] == by_id[user["id"]]["device_last_seen_at"]
        assert by_id[bound["user"]["id"]]["social_binding_count"] == 1
        assert by_id[bound["user"]["id"]]["last_seen_at"] == by_id[bound["user"]["id"]]["social_last_seen_at"]

        detail_user = store.get_agent_user(agent["id"], user["id"])
        assert detail_user is not None
        assert detail_user["email"] == "user@example.com"

        bindings = store.list_agent_social_gateway_bindings(
            agent["id"],
            user_id=bound["user"]["id"],
        )
        assert len(bindings) == 1
        assert bindings[0]["external_user_id"] == "wx_user_1"
        assert bindings[0]["agent_name"] == agent["name"]
    finally:
        store.close()


def test_local_agent_bridge_requires_device_owned_poll_and_response(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        invite = store.create_invite(email="user@example.com", role="member")
        redeemed = store.redeem_invite(invite["code"], email="user@example.com")
        auth = store.authenticate_api_key(redeemed["api_key"])
        assert auth is not None
        agent_id = auth["agents"][0]["id"]

        device_code = store.create_local_device_code(
            auth["user"],
            agent_id,
            label="Work laptop",
        )
        registered = store.redeem_local_device_code(
            device_code["code"],
            device_name="Local Hermes",
        )
        assert registered["device_token"].startswith("hmdt_")
        device_auth = store.authenticate_device_token(registered["device_token"])
        assert device_auth is not None
        assert device_auth["access_context"].tenant_id == "acme"
        assert device_auth["access_context"].user_id == auth["user"]["id"]
        assert device_auth["access_context"].agent_id == agent_id

        request = store.create_local_agent_request(
            device_id=device_auth["device"]["id"],
            request="Please summarize locally available status.",
        )
        assert request["status"] == "pending"

        polled = store.poll_local_agent_requests(device_auth["device"])
        assert [item["id"] for item in polled] == [request["id"]]
        assert polled[0]["status"] == "delivered"

        response = store.respond_local_agent_request(
            device_auth["device"],
            request["id"],
            "Summary only, no private data shared.",
        )
        assert response["status"] == "responded"
        assert response["response"] == "Summary only, no private data shared."

        listed = store.list_local_agent_requests(device_id=device_auth["device"]["id"])
        assert listed[0]["id"] == request["id"]
        assert listed[0]["response"] == "Summary only, no private data shared."
    finally:
        store.close()
