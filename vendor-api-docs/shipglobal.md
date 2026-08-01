# shipglobal Api

## Rate calculator API

url to hit: https://app.shipglobal.in/apiv1/rates/calculate

POST
Rate Calculator
https://app.shipglobal.in/apiv1/rates/calculate
AUTHORIZATION
Basic Auth
Username
demo@example.com

Password
Demo@123

HEADERS
Content-Type
application/json

Accept
application/json

sample body

{
    "package_weight": "0.02",
    "country_iso_code_2": "GB",
    "postcode": "AB32"
}

sample response 


{
  "success": true,
  "billed_weight": 20,
  "billed_weight_unit": "GM",
  "currency": "INR",
  "services": [
    {
      "title": "ShipGlobal Direct",
      "notes": "",
      "transit_time": "7-10 Days",
      "price": {
        "logistic_fee": 285
      },
      "subtotal_fee": 300
    },
    {
      "title": "ShipGlobal First Class",
      "notes": "",
      "transit_time": "7-10 Days",
      "price": {
        "logistic_fee": 311
      },
      "subtotal_fee": 326
    },
    {
      "title": "ShipGlobal Premium",
      "notes": "",
      "transit_time": "6-9 Days",
      "price": {
        "logistic_fee": 718
      },
      "subtotal_fee": 733
    },
    {
      "title": "UPS Promotional",
      "notes": "Duties will be charged, if applicable.",
      "transit_time": "4 - 7 Days",
      "price": {
        "logistic_fee": 2009
      },
      "subtotal_fee": 2009
    },
    {
      "title": "UPS",
      "notes": "Duties will be charged, if applicable.",
      "transit_time": "4 - 7 Days",
      "price": {
        "logistic_fee": 2247
      },
      "subtotal_fee": 2247
    },
    {
      "title": "Fedex",
      "notes": "Duties will be charged, if applicable.",
      "transit_time": "4 - 7 Days",
      "price": {
        "logistic_fee": 2721
      },
      "subtotal_fee": 2721
    }
  ]
}

