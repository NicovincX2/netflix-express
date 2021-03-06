'use strict';

const { Op } = require('sequelize');

// Get models
const models = require('./models');

// // Connection à la database (effectué dans models/index.js)
// const sequelize = new Sequelize('database', 'username', 'password', {
//     dialect: 'sqlite',
//     storage: 'data/database.sqlite3', // or ':memory:'
// });

async function updateOrCreateEntry(model, where, newItem) {
    // First try to find the record
    const foundItem = await model.findOne({ where });
    if (!foundItem) {
        // Item not found, create a new one
        const item = await model.create(newItem)
        return { item, wasCreated: true };
    }
    // Found an item, update it
    // const item = await model.update(newItem, { where, returning: true, plain: true});
    // updatedAt est mis à jour automatiquement si un changement est effectué sur l'entrée
    const item = await foundItem.update(newItem, { fields: ["date"] })
    return { item, wasCreated: false };
}


async function updateOrCreateJSON(ObjectArray) {
    console.log("Updating database.");
    // Loop over JSON entries stored in ObjectArray and updateOrCreateEntry
    const loadPromises = ObjectArray.map(entry => {
        updateOrCreateEntry(models.Title, {
            name: entry.name,
            type: entry.type,
        }, {
            name: entry.name,
            date: entry.date,
            type: entry.type ? "Seen" : "Rated",
            createdAt: entry.createdAt
        })
    });
    await Promise.all(loadPromises);
}


async function CreateJSON(ObjectArray, is_seen) {
    // renvoie les éléments présents dans database et le fichier JSON
    const titles = await models.Title.findAll({
        where: {
            type: {
                [Op.in]: ObjectArray.map((item) => item.type),
            },
            name: {
                [Op.in]: ObjectArray.map((item) => item.name),
            },
        }, raw: true
    });
    // console.log(titles);

    // once we get titles continue on
    // flag wasCreated
    let wasCreated = false;
    if (!(Array.isArray(titles) && titles.length)) {
        // Aucune entrée du fichier JSON n'est présente dans la database
        console.log("Repopulating Database");
        wasCreated = true;

        // transaction delete and create (same as migration)
        let transaction;
        try {
            // get transaction
            transaction = await models.sequelize.transaction();

            // par sécurité on supprime les entrées du fichier JSON
            await models.Title.destroy({ where: { type: is_seen }, transaction: transaction });
            await models.Title.bulkCreate(ObjectArray.map(item => {
                return {
                    name: item.name,
                    date: item.date,
                    type: item.type ? "Seen" : "Rated",
                }
            }), { transaction: transaction, validate: true });

            await transaction.commit();
        } catch (err) {
            console.log("Erreur de transaction.");
            // Rollback transaction only if the transaction object is defined
            if (transaction) await transaction.rollback();
        }
    }
    return { titles, wasCreated };
}


async function processJSON(ObjectArray, is_seen) {
    let res = await CreateJSON(ObjectArray, is_seen);
    // once we get res continue on
    if (!(res.wasCreated))
        await updateOrCreateJSON(ObjectArray)
}

exports.processJSON = processJSON;