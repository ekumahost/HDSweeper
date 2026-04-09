// SPA Router
var App = {
    currentPage: "dashboard",
    pages: {
        dashboard: DashboardPage,
        setup: SetupPage,
        gas: GasPage,
        contracts: ContractsPage,
        rpcs: RpcsPage,
        keys: KeysPage,
        wallets: WalletsPage,
        balances: BalancesPage,
        sweep: SweepPage,
        logs: LogsPage,
    },

    navigate: async function(page) {
        this.currentPage = page;
        document.querySelectorAll(".tab").forEach(function(t) {
            t.classList.toggle("active", t.dataset.page === page);
        });
        location.hash = page;

        var target = document.getElementById("app");
        var handler = this.pages[page];
        if (!handler) {
            target.innerHTML = '<div class="empty">Page not found</div>';
            return;
        }

        try {
            target.innerHTML = '<div style="text-align:center;padding:40px"><span class="spinner"></span></div>';
            target.innerHTML = await handler.render();
            if (handler.afterRender) await handler.afterRender();
        } catch (err) {
            console.error("Page " + page + " error:", err);
            target.innerHTML = '<div class="card"><h2>Error</h2><p style="color:var(--red)">' + (err.error || err.message || "Unknown error") + "</p></div>";
        }
    },

    init: function() {
        var self = this;
        document.querySelectorAll(".tab").forEach(function(tab) {
            tab.addEventListener("click", function() {
                self.navigate(tab.dataset.page);
            });
        });
        var hash = location.hash.slice(1);
        if (hash && self.pages[hash]) {
            self.navigate(hash);
        } else {
            self.navigate("dashboard");
        }
    },
};

document.addEventListener("DOMContentLoaded", function() {
    App.init();
});