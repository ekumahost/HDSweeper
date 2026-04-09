// Balances page — check wallet balances across all chains
var BalancesPage = {
    _address: "",
    _loading: false,
    _data: null,
    render: async function() {
        var html = '<div class="card"><h2>Wallet Balances</h2>' +
            '<p style="color:var(--text-dim);font-size:12px;margin-bottom:12px">' +
            "Enter a wallet address or derivation index to view balances across all configured chains and tokens." +
            "</p>" +
            '<div style="display:flex;gap:8px;align-items:center">' +
            '<input id="balAddr" type="text" placeholder="0x... address or derivation index" ' +
            'value="' + BalancesPage._address.replace(/"/g, '&quot;') + '" ' +
            'style="flex:1" onkeydown="if(event.key===\'Enter\'){BalancesPage.lookup()}" />' +
            '<button class="btn btn-primary" onclick="BalancesPage.lookup()">Check Balances</button>' +
            '</div></div>' +
            '<div id="balResults"></div>';
        return html;
    },

    afterRender: function() {
        if (BalancesPage._data) {
            BalancesPage.renderResults(BalancesPage._data);
        }
    },

    lookup: async function() {
        var el = document.getElementById("balAddr");
        var input = el ? el.value.trim() : "";
        if (!input) return toast("Enter address or index", "error");
        var address = input;
        // If numeric, resolve derivation index to address
        if (/^\d+$/.test(input)) {
            try {
                var data = await API.get("/api/keys/list?search=" + input + "&limit=1");
                if (data.keys && data.keys.length > 0 && data.keys[0].derivationIndex === Number(input)) {
                    address = data.keys[0].address;
                } else {
                    return toast("No key found for index " + input, "error");
                }
            } catch (e) {
                return toast("Failed to resolve index", "error");
            }
        }

        if (!/^0x[0-9a-fA-F]{40}$/i.test(address)) {
            return toast("Invalid address", "error");
        }

        BalancesPage._address = input;
        var wrap = document.getElementById("balResults");
        if (wrap) wrap.innerHTML = '<div style="text-align:center;padding:30px"><span class="spinner"></span> Fetching balances across all chains...</div>';

        try {
            var resp = await API.get("/api/balances/" + address);
            BalancesPage._data = resp;
            BalancesPage.renderResults(resp);
        } catch (e) {
            if (wrap) wrap.innerHTML = '<div class="card"><p style="color:var(--red)">Failed to fetch balances</p></div>';
        }
    },
    renderResults: function(data) {
        var wrap = document.getElementById("balResults");
        if (!wrap) return;

        var html = '<div class="card"><h2>Balances for ' +
            '<span style="font-family:monospace;font-size:14px" title="' + data.address + '">' +
            data.address.slice(0, 10) + "\u2026" + data.address.slice(-8) + '</span>' +
            (data.derivationIndex != null ? ' <span style="color:var(--text-dim);font-size:12px">(Index #' + data.derivationIndex + ')</span>' : '') +
            '</h2>';

        var chains = data.chains || [];
        if (chains.length === 0) {
            html += emptyState("No active RPC chains configured");
            html += '</div>';
            wrap.innerHTML = html;
            return;
        }

        var hasAnyBalance = false;

        chains.forEach(function(chain) {
            var nativeBal = parseFloat(chain.nativeBalance) || 0;
            var chainHasBalance = nativeBal > 0;
            var tokenRows = "";

            (chain.tokens || []).forEach(function(tok) {
                var bal = parseFloat(tok.balance) || 0;
                if (bal > 0) chainHasBalance = true;
                tokenRows += "<tr>" +
                    '<td style="font-family:monospace;font-size:12px">' + tok.symbol + "</td>" +
                    '<td style="color:var(--text-dim);font-size:11px" title="' + tok.contractAddress + '">' +
                    tok.contractAddress.slice(0, 8) + "\u2026" + tok.contractAddress.slice(-6) + "</td>" +
                    '<td style="font-family:monospace;text-align:right;' + (bal > 0 ? 'color:var(--green);font-weight:600' : 'color:var(--text-dim)') + '">' +
                    formatBalance(tok.balance) + "</td>" +
                    "</tr>";
            });

            if (chainHasBalance) hasAnyBalance = true;

            html += '<div style="margin-top:16px;padding:12px;background:var(--card-bg);border:1px solid var(--border);border-radius:8px">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
                '<h3 style="margin:0;font-size:14px">' + chain.chainName +
                ' <span style="color:var(--text-dim);font-size:11px">(Chain ' + chain.chainId + ')</span></h3>' +
                '<span style="font-family:monospace;font-size:13px;' + (nativeBal > 0 ? 'color:var(--green);font-weight:600' : 'color:var(--text-dim)') + '">' +
                formatBalance(chain.nativeBalance) + " " + chain.nativeSymbol + '</span>' +
                '</div>';

            if (tokenRows) {
                html += '<div class="table-wrap"><table style="margin:0">' +
                    "<thead><tr><th>Token</th><th>Contract</th><th style=\"text-align:right\">Balance</th></tr></thead>" +
                    "<tbody>" + tokenRows + "</tbody></table></div>";
            } else {
                html += '<p style="color:var(--text-dim);font-size:11px;margin:0">No tokens configured for this chain</p>';
            }

            html += '</div>';
        });

        if (!hasAnyBalance) {
            html += '<p style="color:var(--text-dim);margin-top:12px;font-size:12px;text-align:center">No non-zero balances found on any chain.</p>';
        }

        html += '</div>';
        wrap.innerHTML = html;
    },
};

function formatBalance(val) {
    var n = parseFloat(val);
    if (isNaN(n) || n === 0) return "0";
    if (n < 0.000001) return "<0.000001";
    if (n < 1) return n.toFixed(6);
    if (n < 1000) return n.toFixed(4);
    return Number(n.toFixed(2)).toLocaleString();
}