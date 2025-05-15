
import prompt from 'prompt';
import pg from 'pg';
import fs from 'fs';

const { Client } = pg;
const client = new Client({
    connectionString: 'postgresql://hotel_owner:npg_z1IQbw4BxJFV@ep-quiet-cherry-a2j1rik9-pooler.eu-central-1.aws.neon.tech/hotel?sslmode=require'
});

// Function for viewing reservations
async function getDataFromDB() {
    const { rows } = await client.query('SELECT * FROM reservations');
    console.log(rows);
}

// Function for adding a new reservation
async function insertDataIntoDB(data) {
    const queryText = 'INSERT INTO reservations(first_name, last_name, room_number, date_of_entry, departure_date) VALUES($1, $2, $3, $4, $5)';
    const res = await client.query(queryText, [data.first_name, data.last_name, data.room_number, data.date_of_entry, data.departure_date]);
    console.log(res);
}

// Request data for a new reservation
async function getDataFromConsole() {
    prompt.start();

    const schema = {
        properties: {
            first_name: {
                description: 'First name',
                type: 'string'
            },
            last_name: {
                description: 'Last name',
                type: 'string'
            },
            room_number: {
                description: 'Room number',
                type: 'number'
            },
            date_of_entry: {
                description: 'Date of entry (YYYY-MM-DD)',
                type: 'string'
            },
            departure_date: {
                description: 'Departure date (YYYY-MM-DD)',
                type: 'string'
            }
        }
    };

    const { first_name, last_name, room_number, date_of_entry, departure_date } = await prompt.get(schema);
    return { first_name, last_name, room_number, date_of_entry, departure_date };
}

// Function to update an existing reservation
async function updateReservation() {
    prompt.start();
    const schema = {
        properties: {
            id: {
                description: 'Enter reservation ID to update',
                type: 'number'
            },
            first_name: {
                description: 'New first name (leave the line blank to leave this item unchanged)',
                type: 'string',
                required: false
            },
            last_name: {
                description: 'New last name (leave the line blank to leave this item unchanged)',
                type: 'string',
                required: false
            },
            room_number: {
                description: 'New room number (leave the line blank to leave this item unchanged)',
                type: 'number',
                required: false
            },
            date_of_entry: {
                description: 'New date of entry (YYYY-MM-DD; leave the line blank to leave this item unchanged)',
                type: 'string',
                required: false
            },
            departure_date: {
                description: 'New departure date (YYYY-MM-DD; leave the line blank to leave this item unchanged)',
                type: 'string',
                required: false
            }
        }
    };

    const data = await prompt.get(schema);

    const oldRes = await client.query('SELECT * FROM reservations WHERE id = $1;', [data.id]);
    if (oldRes.rows.length === 0) {
        console.log('Reservation not found with provided ID.');
        return;
    }
    const oldData = oldRes.rows[0];

    // Function to leave the current value if the user has not entered anything
    const queryText = `
    UPDATE reservations
    SET first_name = COALESCE(NULLIF($1, ''), first_name),
        last_name = COALESCE(NULLIF($2, ''), last_name),
        room_number = COALESCE($3, room_number),
        date_of_entry = COALESCE(NULLIF($4, '')::date, date_of_entry),
        departure_date = COALESCE(NULLIF($5, '')::date, departure_date)
    WHERE id = $6;
  `;
    const values = [
        data.first_name,
        data.last_name,
        data.room_number,
        data.date_of_entry,
        data.departure_date,
        data.id
    ];

    const res = await client.query(queryText, values);
    console.log('Reservation updated successfully!', res);

    const newRes = await client.query('SELECT * FROM reservations WHERE id = $1;', [data.id]);
    const newData = newRes.rows[0];

    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - Reservation ID ${data.id} updated:\nOld Data: ${JSON.stringify(oldData)}\nNew Data: ${JSON.stringify(newData)}\n\n`;
    fs.appendFileSync('change_history.log', logEntry);
    console.log('Change history logged to file.');
}

// Function for canceling a reservation
async function cancelReservation() {
    prompt.start();
    const { id } = await prompt.get({
        name: 'id',
        description: 'Enter reservation ID to cancel',
        type: 'number'
    });
    const queryText = 'DELETE FROM reservations WHERE id = $1;';
    const res = await client.query(queryText, [id]);
    console.log('Reservation cancelled successfully!', res);
}

// Функція для отримання історії бронювань для заданих кімнат
async function getReservationHistoryForSpecificRooms() {
    console.log('Fetching reservation history for specific rooms...');
    
    // Запускаємо prompt для введення кімнат (через кому)
    prompt.start();
    const { room_numbers } = await prompt.get({
        name: 'room_numbers',
        description: 'Enter room numbers separated by comma (e.g., 101,102)',
        type: 'string'
    });
    
    // Перетворюємо введення користувача у масив чисел
    const roomsArray = room_numbers
        .split(',')
        .map(num => num.trim())
        .map(num => parseInt(num, 10))
        .filter(num => !isNaN(num));
    if (roomsArray.length === 0) {
        console.log('No valid room numbers entered.');
        return;
    }
    
    console.log('Searching history for rooms:', roomsArray);

    const queryText = `
        SELECT room_number, first_name, last_name, date_of_entry, departure_date 
        FROM reservations 
        WHERE room_number = ANY($1)
        ORDER BY room_number, date_of_entry DESC;
    `;
    const { rows } = await client.query(queryText, [roomsArray]);
    console.log('History for specified rooms:', rows);
}

async function getChangeHistoryFromFile() {
    try {
        const history = fs.readFileSync('change_history.log', 'utf8');
        console.log('Change History:');
        console.log(history);
    } catch (err) {
        console.error('Error reading change history file:', err);
    }
}

// Functions for selecting actions: add, view, update, cancel
async function main() {
    await client.connect();

    const action = process.argv[2];

    switch (action) {
        case 'view':
            await getDataFromDB();
            break;
        case 'update':
            await updateReservation();
            break;
        case 'cancel':
            await cancelReservation();
            break;
        case 'room-history':
            await getReservationHistoryForSpecificRooms();
            break;
            case 'change-history':
            await getChangeHistoryFromFile();
            break;
        case 'add':
        default:
            const userData = await getDataFromConsole();
            await insertDataIntoDB(userData);
            console.log('Reservation has been added successfully!');
    }

    await client.end();
}

// Function for viewing reservation history (completed reservations)
async function getReservationHistory() {
    console.log('Fetching reservation history (completed reservations)...');
    const queryText = 'SELECT * FROM reservations WHERE departure_date < CURRENT_DATE ORDER BY departure_date DESC;';
    const { rows } = await client.query(queryText);
    console.log(rows);
}

main();