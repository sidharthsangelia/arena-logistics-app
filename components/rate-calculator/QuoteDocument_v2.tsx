import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

import { RateQuote, RateRequest } from "@/lib/types";
import { ClientInfo } from "./QuoteSheet";

interface Props {
  quote: RateQuote;
  request: RateRequest;
  client: ClientInfo;
  markupPercent: number;
  quoteNumber: string;
}

const C = {
  primary: "#0B1F3A",
  muted: "#667085",
  border: "#E4E7EC",
  bg: "#F8FAFC",
  white: "#FFFFFF",
  accent: "#2563EB",
};

const s = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: "#101828",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 12,
  },
  logo: { width: 120, height: 50, objectFit: "contain" },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: C.primary,
    marginBottom: 4,
  },
  subtitle: { color: C.muted, fontSize: 8 },
  quoteBox: {
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
    width: 160,
  },
  hero: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    padding: 16,
    marginBottom: 18,
  },
  heroRoute: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  city: { fontSize: 16, fontFamily: "Helvetica-Bold", color: C.primary },
  metricRow: { flexDirection: "row", justifyContent: "space-between" },
  metric: { width: "30%" },
  label: { fontSize: 7, color: C.muted },
  value: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
    color: C.primary,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  card: {
    flex: 1,
    borderWidth: 1,
    borderColor: C.border,
    padding: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: C.border,
  },
  row: {
    flexDirection: "row",
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  head: { backgroundColor: C.bg, fontFamily: "Helvetica-Bold" },
  col1: { width: "70%" },
  col2: { width: "30%", textAlign: "right" },
  totalBox: {
    marginTop: 12,
    marginLeft: "auto",
    width: 220,
    borderWidth: 1,
    borderColor: C.border,
  },
  totalHero: {
    backgroundColor: C.primary,
    padding: 10,
  },
  totalText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
  },
});

function fmt(amount:number,currency:string){
 return new Intl.NumberFormat("en-IN",{style:"currency",currency}).format(amount);
}

export default function QuoteDocument({
 quote,request,client,markupPercent,quoteNumber
}:Props){

 const factor = 1 + markupPercent/100;
 const total = quote.totalWithTax * factor;
 const chargeable = Math.max(
   request.shipment.weight,
   (request.shipment.dimensions.length *
    request.shipment.dimensions.width *
    request.shipment.dimensions.height) / 5000
 );

 return (
  <Document>
   <Page size="A4" style={s.page}>

    <View style={s.header}>
      <View>
        <Image src="/arena_logo.png" style={s.logo} />
        <Text style={s.title}>INTERNATIONAL FREIGHT QUOTATION</Text>
        <Text style={s.subtitle}>Arena Cargo & Logistics India Pvt Ltd</Text>
      </View>

      <View style={s.quoteBox}>
        <Text>Quote No: {quoteNumber}</Text>
        <Text>Carrier: {quote.vendorName}</Text>
        <Text>Service: {quote.productName}</Text>
        <Text>Currency: {quote.currency}</Text>
      </View>
    </View>

    <View style={s.hero}>
      <View style={s.heroRoute}>
        <Text style={s.city}>{request.origin.city}</Text>
        <Text style={s.city}>✈</Text>
        <Text style={s.city}>{request.destination.city}</Text>
      </View>

      <View style={s.metricRow}>
        <View style={s.metric}>
          <Text style={s.label}>Transit Time</Text>
          <Text style={s.value}>{quote.tatDays} Days</Text>
        </View>

        <View style={s.metric}>
          <Text style={s.label}>Chargeable Weight</Text>
          <Text style={s.value}>{chargeable.toFixed(2)} KG</Text>
        </View>

        <View style={s.metric}>
          <Text style={s.label}>Total Quote</Text>
          <Text style={s.value}>{fmt(total, quote.currency)}</Text>
        </View>
      </View>
    </View>

    <View style={s.section}>
      <Text style={s.sectionTitle}>Client & Shipment</Text>

      <View style={s.cardRow}>
        <View style={s.card}>
          <Text>{client.company}</Text>
          <Text>{client.name}</Text>
        </View>

        <View style={s.card}>
          <Text>{request.shipment.description}</Text>
          <Text>{request.shipment.quantity} Pieces</Text>
        </View>
      </View>
    </View>

    <View style={s.section}>
      <Text style={s.sectionTitle}>Pricing Summary</Text>

      <View style={s.table}>
        <View style={[s.row,s.head]}>
          <Text style={s.col1}>Charge</Text>
          <Text style={s.col2}>Amount</Text>
        </View>

        {quote.charges.map((c,i)=>(
          <View key={i} style={s.row}>
            <Text style={s.col1}>{c.name}</Text>
            <Text style={s.col2}>{fmt(c.amount*factor,c.currency)}</Text>
          </View>
        ))}
      </View>

      <View style={s.totalBox}>
        <View style={s.totalHero}>
          <Text style={s.totalText}>
            TOTAL: {fmt(total,quote.currency)}
          </Text>
        </View>
      </View>
    </View>

   </Page>
  </Document>
 );
}
