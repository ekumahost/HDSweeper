// Setup page
var SetupPage = {
    render: async function() {
        var data = await API.get("/api/config");
        var hasMnemonic = data.hasMnemonic;
        var preview = data.mnemonicPreview || "";
        var custodial = data.custodialWallet || "";
        var fromEnv = data.mnemonicSource === "env";

        var mnemonicCard = "";
        if (fromEnv && hasMnemonic) {
            // Mnemonic loaded from .env — read-only
            mnemonicCard = '<div class="card">' +
                "<h2>Mnemonic Phrase</h2>" +
                '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
                '<span class="badge badge-green">Loaded from .env</span>' +
                '</div>' +
                '<p style="color:var(--text-dim);font-size:13px">Mnemonic was imported from the <code>MNEMONIC</code> environment variable and encrypted in the database. ' +
                'To change it, update the <code>.env</code> file and restart the server with a fresh database.</p>' +
                (preview ? '<p style="color:var(--text-dim);font-size:12px;margin-top:8px">Preview: ' + preview + "</p>" : "") +
                "</div>";
        } else {
            // Standard UI form
            mnemonicCard = '<div class="card">' +
                "<h2>Mnemonic Phrase</h2>" +
                '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px">' +
                "Enter your 12-word mnemonic. It will be encrypted (AES-256) and stored in the database." +
                "</p>" +
                '<div class="form-group">' +
                "<label>Mnemonic (12 words)</label>" +
                '<textarea id="mnemonicInput" placeholder="word1 word2 word3 ... word12" rows="2">' +
                (hasMnemonic ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022  (encrypted & saved)" : "") +
                "</textarea>" +
                "</div>" +
                '<div class="btn-group">' +
                '<button class="btn btn-primary" onclick="SetupPage.saveMnemonic()">Save Mnemonic</button>' +
                (hasMnemonic ? ' <button class="btn btn-danger" onclick="SetupPage.deleteMnemonic()">Delete</button>' : "") +
                "</div>" +
                (hasMnemonic && preview ? '<p style="color:var(--text-dim);font-size:12px;margin-top:8px">Preview: ' + preview + "</p>" : "") +
                "</div>";
        }

        return mnemonicCard +

            '<div class="card">' +
            "<h2>Custodial Wallet</h2>" +
            '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px">' +
            "The destination address where all swept funds will be sent." +
            "</p>" +
            '<div class="form-group">' +
            "<label>Wallet Address</label>" +
            '<input id="custodialInput" placeholder="0x..." value="' + custodial + '" />' +
            "</div>" +
            '<div class="btn-group">' +
            '<button class="btn btn-primary" onclick="SetupPage.saveCustodial()">Save Custodial Wallet</button>' +
            (custodial ? ' <button class="btn btn-danger" onclick="SetupPage.deleteCustodial()">Delete</button>' : "") +
            "</div>" +
            "</div>" +

            '<div class="card">' +
            "<h2>Status</h2>" +
            '<div class="stats-row">' +
            '<div class="stat-box">' +
            '<div class="value" style="color:' + (hasMnemonic ? "var(--green)" : "var(--red)") + '">' +
            (hasMnemonic ? "\u2713" : "\u2717") +
            "</div>" +
            '<div class="label">Mnemonic</div>' +
            "</div>" +
            '<div class="stat-box">' +
            '<div class="value" style="color:' + (custodial ? "var(--green)" : "var(--red)") + '">' +
            (custodial ? "\u2713" : "\u2717") +
            "</div>" +
            '<div class="label">Custodial Wallet</div>' +
            "</div>" +
            "</div>" +
            "</div>";
    },

    saveMnemonic: async function() {
        var val = document.getElementById("mnemonicInput").value.trim();
        if (!val || val.indexOf("\u2022\u2022") !== -1) return toast("Enter a valid mnemonic", "error");
        try {
            await API.post("/api/config/mnemonic", { mnemonic: val });
            toast("Mnemonic saved & encrypted", "success");
            App.navigate("setup");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    deleteMnemonic: async function() {
        if (!confirm("Delete stored mnemonic?")) return;
        try {
            await API.del("/api/config/mnemonic");
            toast("Mnemonic deleted", "success");
            App.navigate("setup");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    saveCustodial: async function() {
        var val = document.getElementById("custodialInput").value.trim();
        if (!/^0x[a-fA-F0-9]{40}$/.test(val)) return toast("Invalid address", "error");
        try {
            await API.post("/api/config/custodial-wallet", { address: val });
            toast("Custodial wallet saved", "success");
            App.navigate("setup");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },

    deleteCustodial: async function() {
        if (!confirm("Delete custodial wallet?")) return;
        try {
            await API.del("/api/config/custodialWallet");
            toast("Deleted", "success");
            App.navigate("setup");
        } catch (e) { toast(e.error || "Failed", "error"); }
    },
};