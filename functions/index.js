
const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

/* Initializing the firebase app. */
const app = admin.initializeApp();

/* Creating an instance of the express framework. */
const TardiEatsApi = express();

/* A middleware that allows cross-origin resource sharing. */
TardiEatsApi.use(cors({origin: true}));
TardiEatsApi.use(bodyParser.json());

/* This is a way of setting the headers for the request. */
const headers = {
  "authorization": `Bearer ${process.env.SECRET}`,
  "content-type": "application/json",
};

/* Setting the base url for the transaction endpoints. */
const transactionUrl = "https://api.paystack.co/transaction";
const chargeUrl = "https://api.paystack.co/charge";

/* This is a route that is used to create a transaction. */
TardiEatsApi.post("/v1/transactions/create", (req, res) => {
    
  const method = req.method;
  const url = `${transactionUrl}/initialize`;
  const data = req.body;
  
  return axios({
    method,
    url,
    data,
    headers,
  }).then(function(response) {
    return res.json(response.data);
  }).catch(function(error) {
    return res.status(error.response.status).json(error.response.data);
  });
});

/* This is a route that is used to verify a transaction. */
TardiEatsApi.get("/v1/transactions/verify/:reference", (req, res) => {
    
  const method = req.method;
  const reference = req.params.reference;
  const url = `${transactionUrl}/verify/${reference}`;

  return axios({
    method,
    url,
    headers,
  }).then(function(response) {
    const result = response.data;
    return res.json(result);
  }).catch(function(error) {
    return res.status(error.response.status).json(error.response.data);
  });
});


/* Creating a route that is used to create a charge. */
TardiEatsApi.post("/v1/checkout", (req, res) => {

 /* Getting the method, url and data from the request. */
  const method = req.method;
  const url = `${chargeUrl}/`;
  const data = req.body;

  /* Making a request to the Paystack API to create a charge. */
  return axios({
    method,
    url,
    data: data.charge,
    headers,
  }).then((response)=>{  
    /* Getting the data from the response. */
    const result = response.data.data;

    /* Getting the order object from the request body. */
    const orderFromRequest = data.order

    const transaction = {
        id: result.reference,
        amount: result.amount,
        transaction_date: result.transaction_date,
        status: result.status,
        reference: result.reference,
        channel: result.channel,
        message: result.message,
        fees: result.fees/100,
        gateway_response: result.gateway_response,
        user_id: result.metadata.user_id,
        order_id: result.reference,
     }

     const order = { 
        ...orderFromRequest, 
        id: transaction.id,
        transaction_ref: transaction.id,
        status: "pending",
        user_id: result.metadata.user_id,
        order_date: transaction.transaction_date,
        date: Date.now()
    }

    try {
        processCheckout(transaction, order)
        return res.status(200).json({
            status: result.status, 
            message: result.message, 
            reference: result.reference
        })
    } catch (error) {
        return res.status(500).json(error)
    }
  }).catch(function(error) {
    return res.status(error.response.status).json(error.response.data);
  });
});

/* This is a route that is used to submit the OTP 
that was sent to the user's phone number. */
TardiEatsApi.post("/v1/checkout/otp", (req, res) => {

  const method = req.method;
  const url = `${chargeUrl}/submit_otp`;
  const data = req.body;
  
  return axios({
    method,
    url,
    data,
    headers,
  }).then(function(response) {
    return res.json(response.data);
  }).catch(function(error) {
    return res.status(error.response.status).json(error.response.data);
  });
});

/* This is a route that is used to handle the webhook 
that is sent by Paystack. */
TardiEatsApi.post("/webhook", (req, res) => {

  /* Getting the body of the request. */
  const hookEvent = req.body;
  
  /* This is a route that is used to handle the webhook that is sent by Paystack. */
  if (hookEvent && hookEvent.event === "charge.success") {
      const data = hookEvent.data;
      const transactionStatus = data.status
      const transactionRef = data.reference
     /* This is a way of updating the order status and the transaction status. */
      if (transactionStatus === "success") {
          updateOrder(transactionRef, { transactionStatus: "paid", orderStatus: "success" })
      }else {
        updateOrder(transactionRef, { transactionStatus, orderStatus: transactionStatus })
      }
      res.status(200).send(response.data);
  } else {
    res.sendStatus(200);
  }
});

/* This is a route that is used to handle all requests that are not defined. */
TardiEatsApi.all("/*", (req, res) => {
  functions.logger.error("Client access denied. Accessing default route");
  res.status(401).send({"url": req.url});
});


/**
 * It takes a transaction and an order, and then it creates a batch and adds the transaction and order
 * to the batch
 * @param transaction - The transaction object that we created earlier.
 * @param order - The order object that was created in the previous step.
 * @returns The result of the batch.commit()
 */
const processCheckout = async (transaction, order) => {

    const batch = admin.firestore(app).batch()

    const transactionRef = admin.firestore(app).collection('Transactions').doc(transaction.id)
    batch.set(transactionRef, transaction)

    const orderRef = admin.firestore(app).collection('Orders').doc(order.id)
    batch.set(orderRef, order)

    return await batch.commit()
}

/**
 * It updates the status of a transaction and order in Firestore
 * @param reference - The unique reference of the order
 * @returns A promise
 */
const updateOrder = async (reference, { transactionStatus, orderStatus }) => {
  const batch = admin.firestore(app).batch()

  const transactionRef = admin.firestore(app).collection('Transactions').doc(reference)
  batch.update(transactionRef, {status: transactionStatus})

  const orderRef = admin.firestore(app).collection('Orders').doc(reference)
  batch.update(orderRef, {status: orderStatus})

  return await batch.commit()
}

/* This is a way of exporting the TardiEatsApi function. */
exports.TardiEatsApi = functions.https.onRequest(TardiEatsApi);




