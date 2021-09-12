const request = require('request');
const SteamUser = require('steam-user');
const SteamTotp = require("steam-totp");
const SteamCommunity = require("steamcommunity");
const TradeOfferManager = require("steam-tradeoffer-manager");

const sets_db = require('./sets_db.json');
const config = require('config.js');

const values = typeof Object.values == 'function' ? Object.values : (json) => {
    let array = [];
    for (let val in json) {
        array.push(json[val]);
    }
    return array;
};
const rates = { "440": config.rate_tf2 };


var client = new SteamUser();
var manager = new TradeOfferManager({
    "steam": client,
    "language": "en",
    "pollInterval": "10000",
    "cancelTime": 60 * 1000
});
var community = new SteamCommunity();

client.logOn({
    accountName: config.username,
    password: config.password,
    twoFactorCode: SteamTotp.getAuthCode(config.shared_secret),
    rememberPassword: true
});

client.on('loggedOn', function(details) {
    console.log("Logged into Steam as " + client.steamID.getSteam3RenderedID());
    client.setPersona(SteamUser.EPersonaState.Online);
    client.gamesPlayed(config.gamePlay);
    checkKeyAmount(client.steamID.getSteamID64());
});

client.on('error', function(e) {
    console.log(e);
});

client.on('webSession', function(sessionID, cookies) {
    console.log("Got web session");
    manager.setCookies(cookies, function(err) {
        if (err) {
            console.log(err);
            process.exit(1); // Fatal error since we couldn't get our API key
            return;
        }
        console.log("Got API key: " + manager.apiKey);
    });
    community.setCookies(cookies);
    community.startConfirmationChecker(10000, config.identity_secret);
});

client.on('wallet', function(hasWallet, currency, balance) {
    console.log("Our wallet balance is " + SteamUser.formatCurrency(balance, currency));
});

client.on('licenses', function(licenses) {
    console.log("Our account owns " + licenses.length + " license" + (licenses.length == 1 ? '' : 's') + ".");
});

community.on('confirmationAccepted', function(conf) {
    console.log("Confirmation accepted");
});

manager.on('newOffer', function(offer) {
    console.log("New offer #" + offer.id + " from " + offer.partner.getSteam3RenderedID());
    var steamID = offer.partner.getSteamID64();
    if (config.admins.indexOf(steamID) > -1) { // Accept trade offers from admins
        offer.accept(err => {
            if (err) {
                console.log(err);
            }
        });
    } else {
        let sets = [];
        let cards = {};
        let keys = {};
        let keysAmount = [];
        offer.itemsToReceive.forEach((card, i) => {
            let appid = card.market_hash_name.split("-")[0];
            if (!cards[appid]) {
                cards[appid] = {};
            }
            if (!cards[appid][card.market_hash_name]) {
                cards[appid][card.market_hash_name] = [];
            }
            cards[appid][card.market_hash_name].push(card);
        });
        for (let appid in cards) {
            if (sets_db[appid]) {
                if (Object.keys(cards[appid]).length == sets_db[appid]) {
                    let customerHave = Math.min.apply(Math, values(cards[appid]).map((card) => card.length));
                    for (let i = 0; i < customerHave; i++) {
                        let currentCustomerSet = []
                        for (let card in cards[appid]) {
                            currentCustomerSet.push(cards[appid][card][i]);
                        }
                        sets.push(currentCustomerSet);
                    }
                }
            }
        }
        offer.itemsToGive.forEach((key, i) => {
            let appid = key.appid;
            if (appid === 440) {
                keysAmount.push(appid);
            } else if (appid === 730) {}
        });
        var cardSets = sets.length;
        var keys = keysAmount.length;

        console.log(cardSets + " sets for " + keys + " keys | RATE: " + (cardSets / keys).toFixed(2) + " |");
        if (keysAmount[0] === 440) {
            if (cardSets / keys >= rates[keysAmount[0]]) {
                console.log("Accepting the offer because of rate better/equal than our rate (" + rates[keysAmount[0]] + ")");
                offer.accept(err => {
                    if (err) {
                        console.log(err);
                    }
                });
            } else {
                console.log("Reject the offer because of rate worse than our rate (" + rates[keysAmount[0]] + ")");
            }
        }
    }
});

function checkKeyAmount(steamID){
	community.getUserInventoryContents(steamID, 440, 2, true, (err, inventory) => {
        if (err) {
            resolve("error");
        } else {
            keyAmount = inventory.filter(function (el) {
                return el.market_hash_name.indexOf('Mann Co. Supply Crate Key') > -1;
            }).length;
            console.log('We have '+keyAmount+ ' Mann Co. Supply Crate Keys in our inventory');
        }
    });
}