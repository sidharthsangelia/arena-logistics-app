# shipglobal Api


postman collection https://documenter.getpostman.com/view/27717351/2s9YXfd4Ky#d6d84ced-c1e9-45dd-8534-316d83e70e88

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


POST
Add Order
https://app.shipglobal.in/apiv1/order/add
✅ Required Fields
📄 Invoice & Order
invoice_no (string) – Invoice number (must be unique).

invoice_date (string, YYYY-MM-DD) – Date of the invoice.

order_reference (string) – Unique order identifier/reference.

service (string) – Shipping service name (e.g., Shipglobal Direct).

📦 Package Details
package_weight (string) – Total weight of the package in kg.

package_length (string) – Length of the package (cm).

package_breadth (string) – Breadth/width of the package (cm).

package_height (string) – Height of the package (cm).

💱 Currency
currency_code (string) – Currency code (e.g., USD, INR).
Supported Values:

AED – United Arab Emirates Dirham

AUD – Australian Dollar

CAD – Canadian Dollar

EUR – Euro

GBP – British Pound

INR – Indian Rupee

SAR – Saudi Riyal

USD – US Dollar

🚚 CSB5 Status
csb5_status (integer) – 0 for normal shipments; 1 for CSB-5 export.
👤 Customer Shipping Info
customer_shipping_firstname (string)

customer_shipping_lastname (string)

customer_shipping_mobile (string)

customer_shipping_email (string)

customer_shipping_address (string)

customer_shipping_address_2 (string)

customer_shipping_address_3 (string)

customer_shipping_city (string)

customer_shipping_postcode (string)

customer_shipping_country_code (string, ISO 2-letter)

customer_shipping_state (string)

📦 Order Items (Array: vendor_order_items[])
Each item must include:

vendor_order_item_name (string)

vendor_order_item_quantity (string or integer)

vendor_order_item_unit_price (string or float)

vendor_order_item_hsn (string)

vendor_order_item_tax_rate (string or float)

⚠️ Conditionally Required
customer_nickname (string) – Required for franchise customers only.
📝 Optional Fields
ioss_number

vendor_order_item_sku

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

Body
raw (json)

{
    "invoice_no": "INV-2222",
    "invoice_date": "2023-10-27",
    "order_reference": "API-2222",
    "service": "Shipglobal Direct",
    "package_weight": ".5",
    "package_length": "10",
    "package_breadth": "10",
    "package_height": "10",
    "currency_code": "USD",
    "csb5_status": 1,
    "customer_shipping_firstname": "John",
    "customer_shipping_lastname": "Smith",
    "customer_shipping_mobile": "+1-999-999-9999",
    "customer_shipping_email": "demo@example.com",
    "customer_shipping_company": "",
    "customer_shipping_address": "4 building name",
    "customer_shipping_address_2": "5th Street",
    "customer_shipping_address_3": "",
    "customer_shipping_city": "SAN JOSE",
    "customer_shipping_postcode": "95134",
    "customer_shipping_country_code": "US",
    "customer_shipping_state": "CA",
    "ioss_number": "",
    "customer_nickname": "", // Required for Franchise
    "vendor_order_items": [
        {
            "vendor_order_item_name": "mugs",
            "vendor_order_item_sku": "",
            "vendor_order_item_quantity": "1",
            "vendor_order_item_unit_price": "54",
            "vendor_order_item_hsn": "61112000",
            "vendor_order_item_tax_rate": "0"
        },
        {
            "vendor_order_item_name": "YELLOW SAREE",
            "vendor_order_item_sku": "",
            "vendor_order_item_quantity": "1",
            "vendor_order_item_unit_price": "54",
            "vendor_order_item_hsn": "61112000",
            "vendor_order_item_tax_rate": "0"
        }
    ]
}




POST
Pay & Get Label
https://app.shipglobal.in/apiv1/order/getLabel
AUTHORIZATION
Basic Auth
Username
demo@example.com

Password
Demo@123

Body
raw (json)
json
{
    "tracking" : "SG32607086295274",
    "label": true
}



POST
Tracking
https://app.shipglobal.in/apiv1/tools/tracking
Parameter	Type	Description
Success	Boolean	Indicates whether the tracking request was successful.
Data	Object	Contains detailed information about the shipment tracking.
Data Object
View More
Parameter	Type	Description
awbEvents	array	An array of shipment tracking events.
awbEvents.historyId	string	Unique identifier for the tracking event history.
awbEvents.datetime	string	The date and time of the event in ISO 8601 format.
awbEvents.location	string	The location where the event occurred.
awbEvents.comment	string	A brief description of the event.
awbEvents.type	string	The type of event (e.g. Lastmile, Connector, Domestic).
awbEvents.eventCode	string	A unique code for the specific event.
awbInfo	object	Contains general information about the shipment.
awbInfo.bookingDate	string	The date when the shipment was booked.
awbInfo.senderName	string	Name of the sender.
awbInfo.destination	string	The destination city and country.
awbInfo.receiverName	string	Name of the receiver.
awbInfo.awbNumber	string	The Air Waybill (AWB) number for the shipment.
awbInfo.lastMileAWB	string	The tracking number for the last mile delivery.
awbInfo.postcode	string	The postal code of the delivery address.
awbInfo.providerLogo	string	URL to the logo of the shipping provider.
awbInfo.lastMileDisplay	string	Current status of the last mile delivery.
awbInfo.lastMileTrackingURL	string	URL for tracking the last mile delivery.
awbInfo.status	string	Current status of the shipment.
Status codes
View More
Code	Description
SGE_001	Shipment Created & Information Received
SGE_002	Shipment Information Shared at Connection
SGE_101	Shipment Pickup Request Received
SGE_102	Shipment Out For Pickup
SGE_103	Carrier notified to pick up package
SGE_104	Shipment picked up from seller's facility
SGE_105	Inbound In-Transit
SGE_106	Received at Origin Sorting Facility
SGE_107	Processed & In-Transit to Airport Facility
SGE_201	Shipment Received At Airport Facility
SGE_202	Received At Origin Airport Facility
SGE_203	Initiated Origin Customs Clearance Process
SGE_204	Awaiting Flight Confirmation
SGE_205	In-Transit to Destination Country
SGE_206	Arrived at Destination Country
SGE_207	Initiated Destination Customs Clearance Process
SGE_208	Shipment Cleared & Handed Over for Connection
SGE_301	Shipment Received At Destination Partner Facility
SGE_302	Shipment In-Transit In Destination Country
SGE_303	Out For Delivery
SGE_304	Shipment Delivered
SGE_305	Shipment Departed Destination Partner Facility
SGE_401	Shipment Interrupted
SGE_402	Shipment Abandoned
SGE_403	Shipment Undelivered
SGE_501	Shipment Available For Collection
SGE_502	Shipment RTO Delivered to Partner Facility
SGE_503	Shipment Processing Issue
SGE_504	Returned to Vendor
SGE_505	Shipment Hold - Additional Information Required
SGE_506	Shipment Damaged
SGERROR_101	Undelivered - Insufficient Address
SGERROR_102	Undelivered - Shipment Refused
SGERROR_103	Undeliverable
SGERROR_104	Shipment Lost/Disposed
Error Table for API Responses
Error code	Error Message	Description	Example Request
E1	Invalid Regex AWB Number	The provided tracking number does not match the expected format or regular expression pattern.	{ "tracking" : "ABHGGFDHJ" }
E1	Tracking Number Required	The tracking number field is missing or empty in the request, which is mandatory for processing.	{ "tracking" : "" }
AUTHORIZATION
Basic Auth
Username
demo@example.com

Password
Demo@123

Body
raw (json)
json
{
    "tracking" : "SG3240206590212"
}


## example request 

POST /apiv1/tools/tracking HTTP/1.1
Host: app.shipglobal.in
Content-Length: 40

{
    "tracking" : "SG3231027366055"
}

## response 

{
  "success": true,
  "data": {
    "awbEvents": [
      {
        "awb_history_id": "4277696",
        "awb_id": 0,
        "awb_history_datetime": "2023-10-03 10:46:11",
        "awb_history_location": "San Jose, CA, US",
        "awb_history_comment": "DELIVERED ",
        "type": "lastmile",
        "awb_history_code": 0,
        "awb_event_code": "SGE_304"
      },
      {
        "awb_history_id": "4277695",
        "awb_id": 0,
        "awb_history_datetime": "2023-10-03 09:26:22",
        "awb_history_location": "Springfield Gardens, NY, US",
        "awb_history_comment": "Out For Delivery Today",
        "type": "lastmile",
        "awb_history_code": 0,
        "awb_event_code": "SGE_303"
      },
      {
        "awb_history_id": "4277694",
        "awb_id": 0,
        "awb_history_datetime": "2023-10-03 06:22:37",
        "awb_history_location": "Springfield Gardens, NY, US",
        "awb_history_comment": "Processing at UPS Facility",
        "type": "lastmile",
        "awb_history_code": 0,
        "awb_event_code": "SGE_302"
      },
      {
        "awb_history_id": "4246966",
        "awb_id": 0,
        "awb_history_datetime": "2023-10-02 12:16:49",
        "awb_history_location": "Springfield Gardens, NY, US",
        "awb_history_comment": "Pickup Scan ",
        "type": "lastmile",
        "awb_history_code": 0,
        "awb_event_code": "SGE_301"
      },
      {
        "awb_history_id": "4246965",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-30 18:07:00",
        "awb_history_location": "USA",
        "awb_history_comment": "Shipment Cleared & Handed Over for Connection",
        "type": "connector",
        "awb_history_code": 0,
        "awb_event_code": "SGE_208"
      },
      {
        "awb_history_id": "4246964",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-30 15:47:00",
        "awb_history_location": "USA",
        "awb_history_comment": "FLIGHT ARRIVED AT DEST. AWAITING CUSTOM CLEARANCE ",
        "type": "connector",
        "awb_history_code": 0,
        "awb_event_code": "SGE_206"
      },
      {
        "awb_history_id": "4246963",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-30 01:14:00",
        "awb_history_location": "DEL",
        "awb_history_comment": "SHIPMENT DEPARTED FROM DELHI HUB",
        "type": "connector",
        "awb_history_code": 0,
        "awb_event_code": "SGE_204"
      },
      {
        "awb_history_id": "4208000",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-29 14:33:00",
        "awb_history_location": "Delhi",
        "awb_history_comment": "Shipment Received At Hub",
        "type": "connector",
        "awb_history_code": 0,
        "awb_event_code": "SGE_202"
      },
      {
        "awb_history_id": "4207999",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-29 13:31:29",
        "awb_history_location": "Delhi",
        "awb_history_comment": "Shipment Information Received.",
        "type": "connector",
        "awb_history_code": 0,
        "awb_event_code": "SGE_001"
      },
      {
        "awb_history_id": "4179244",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-28 23:18:12",
        "awb_history_location": "Delhi, India",
        "awb_history_comment": "Order Processed & Awaiting Airport Arrival",
        "type": "domestic",
        "awb_history_code": 0,
        "awb_event_code": "SGE_107"
      },
      {
        "awb_history_id": "4169664",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-28 18:06:03",
        "awb_history_location": "Delhi, India",
        "awb_history_comment": "Received at Delhi Hub",
        "type": "domestic",
        "awb_history_code": 0,
        "awb_event_code": "SGE_106"
      },
      {
        "awb_history_id": "4161152",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-28 15:11:03",
        "awb_history_location": "-",
        "awb_history_comment": "Shipment Created, Awaiting Package",
        "type": "domestic",
        "awb_history_code": 0,
        "awb_event_code": "SGE_001"
      },
      {
        "awb_history_id": "4183805",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-28 15:11:00",
        "awb_history_location": "HO-CO",
        "awb_history_comment": "Shipment Information Received.",
        "type": "connector",
        "awb_history_code": 0,
        "awb_event_code": "SGE_001"
      },
      {
        "awb_history_id": "4183806",
        "awb_id": 0,
        "awb_history_datetime": "2023-09-28 05:41:18",
        "awb_history_location": ", US",
        "awb_history_comment": "Shipper created a label, UPS has not received the package yet. ",
        "type": "lastmile",
        "awb_history_code": 0,
        "awb_event_code": "SGE_001"
      }
    ],
    "awbInfo": {
      "awb_booking_date": "2023-09-28 15:11:03",
      "awb_sender_name": "linkers",
      "awb_destination": "US",
      "awb_receiver_name": "LINKERS Att Fulfilment Centre",
      "awb_number": "SG3231027366055",
      "partner_lastmile_awb": "XXXXXXXXXX",
      "awb_postcode": "11434",
      "provider_logo": "https://app.shipglobal.in/assets/media/shipglobal/provider/sg.png",
      "partner_lastmile_display": "UPS",
      "partner_lastmile_tracking_url": "https://www.ups.com/track?loc=en_US&requester=QUIC&tracknum=XXXXXXXXXX/trackdetails",
      "awb_status": "DELIVERED "
    }
  }
}

# cancle order 
POST
Cancel & Refund Order
https://app.shipglobal.in/apiv1/order/cancelRefundOrder
AUTHORIZATION
Basic Auth
Username
demo@example.com

Password
Demo@123

Body
raw (json)
json
{
    "tracking" : "SG32407261079582"
}

## Responses recovered from the Postman collection

The pasted docs above cover request shapes; these are the saved response
examples from the same collection, which the paste did not include.

Pay & Get Label — `label` is a base64-encoded PDF, not a URL:

```json
{
    "success": true,
    "tracking": "SG3231107366132",
    "label": "JVBERi0xLjQKMSAwIG9iago8PAovVGl0bGUgKP7/AFMAaABpAHAAIABHAGwAbwBiAGEAbCkK..."
}
```

Cancel & Refund Order — cancelling twice is `success: true`, not an error:

```json
{ "success": true, "msg": "Order Cancelled Successfully" }
{ "success": true, "msg": "Order Already Cancelled" }
```

**Add Order has NO saved response example.** The collection holds five requests
(rates/calculate, order/add, order/getLabel, tools/tracking,
order/cancelRefundOrder) and order/add is the only one without one. Since it is
the call that returns the handle every later call needs, its shape has to come
from ShipGlobal directly.

---

# OPEN QUESTIONS FOR SHIPGLOBAL'S TECH TEAM

Raised 2026-08-11, re-verified 2026-08-24 against the live Postman collection
(nothing in it has changed; `order/add` still has no saved response example).

The booking adapter is deliberately NOT built until the blocking items are
answered. Each one changes what the code must do, and guessing on an export
booking costs a real customer real money. Tracking (`/apiv1/tools/tracking`) and
cancellation (`/apiv1/order/cancelRefundOrder`) are fully specified and need
none of this.

## A. Blocking. Booking cannot be written without these.

1. **`order/add` response body.** The exact success and error JSON. Does it
   return the `SG…` tracking number directly, and under which key? Does a
   validation failure come back as HTTP 4xx, or as HTTP 200 with
   `success: false` the way `rates/calculate` does? This is the call that
   returns the handle every later call needs, and it is the only request in your
   Postman collection with no saved example.

2. **Multi-piece consignments.** `order/add` takes one flat box
   (`package_weight` / `_length` / `_breadth` / `_height`), not an array. How do
   we book a consignment of 3 boxes? Is there a repeatable packages field, one
   order per box, or is multi-piece unsupported on the API? If it is one order
   per box, do the boxes travel as one consignment or as three separate
   shipments through customs?

3. **Idempotency of `order/add` on `order_reference`.** If our call reaches you
   but the response is lost in transit and we retry with the same
   `order_reference`, do we get the existing order back, or a second order? This
   decides whether a retry is safe or books a duplicate export.

4. **An order lookup by `order_reference`.** Separate from 3, and the cheapest
   fix for it. Is there any endpoint that answers "do you already hold an order
   with this reference, and what is its tracking number?" Without one, a lost
   response is indistinguishable from a failed request and we have to stop the
   booking for a human.

5. **Idempotency of `getLabel`.** It is documented as "Pay & Get Label". Does
   calling it twice for the same `tracking` debit the wallet twice, or is the
   second call free and simply returns the same PDF? Our retry logic depends on
   the answer.

## B. Field mapping. These change what we send.

6. **Shipper and pickup address.** `order/add` carries only
   `customer_shipping_*`, which is the consignee. There is no shipper block at
   all. Is the pickup address fixed on the account? We book on behalf of
   multiple exporters with different pickup addresses, so we need to know
   whether a per-order pickup address is possible, and how.

7. **Pickup itself.** Does ShipGlobal collect from the pickup address, or do we
   hand the parcel over at your hub? Is there a pickup request endpoint, or a
   per-order flag? Nothing in `order/add` addresses this.

8. **Exporter identity.** `order/add` carries no IEC, AD code, GSTIN or LUT.
   Confirm these all come from the account, and tell us exactly which must be
   registered with you before an API booking will clear customs.

9. **CSB-4 and commercial exports.** `csb5_status` is 0 or 1 only. We classify
   shipments as CSB4 / CSB5 / COMMERCIAL. Which value covers CSB-4, and how is a
   commercial (non-courier) export declared?

10. **Incoterms.** There is no DDP/DDU or DAP field in `order/add`. Is duty-paid
    set on the account, implied by the service, or unavailable?

11. **`service` matching.** Must it be the exact `title` string from
    `rates/calculate`? Your own docs spell it `ShipGlobal Direct` in the rate
    response but `Shipglobal Direct` in the order body. Is the match
    case-sensitive, which spelling is authoritative, and is there a stable
    service code we can send instead of a display name? A display name that
    changes on your side would silently break every booking.

12. **`currency_code` scope.** Does it apply only to
    `vendor_order_item_unit_price`, or to anything else in the order?

13. **`vendor_order_item_tax_rate`.** What is expected for a zero-rated export
    under LUT: `0`, or the domestic GST rate of the goods? Your sample uses `0`
    but we would rather have the rule than infer it.

14. **Undocumented fields.** `customer_shipping_company` appears in your sample
    body but not in your field list, and `customer_nickname` is described only
    as "required for franchise". Please send the complete field list for
    `order/add`, including anything the sample omits, with each field marked
    required, conditional or optional.

## C. Pricing. This one is commercial, not technical.

15. **Quoted price versus billed price.** `rates/calculate` accepts only
    `package_weight`, `country_iso_code_2` and `postcode`, with no dimensions,
    so it cannot compute volumetric weight. `order/add` does take dimensions.
    Do you recompute the chargeable weight from those dimensions at booking, and
    bill the difference? If so, what is the volumetric divisor, and is there any
    way to get a dimension-aware quote before booking? We quote customers a
    fixed price up front, so a recomputation at booking comes out of our margin.

## D. Operational.

16. **Tracking webhook.** Is polling `/apiv1/tools/tracking` the only option, or
    can you push status updates to a URL we host? Polling every live shipment on
    a schedule is workable, but a webhook is materially better for both sides.

17. **Rate limits** on all five endpoints, and the expected 429 behaviour.

18. **Sandbox or test credentials** that exercise `order/add` and `getLabel`
    without moving real money or creating a real export.
