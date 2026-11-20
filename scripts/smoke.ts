import { sfQuery, SalesforceError } from "../src/salesforce.js";

process.loadEnvFile();

const doctors = await sfQuery<{ Name: string; Working_Days__c: string }>(
  "SELECT Name, Working_Days__c FROM Clinic_Doctor__c ORDER BY Name",
);
console.log("Doctors:", doctors.map((d) => `${d.Name} (${d.Working_Days__c})`).join(", "));

try {
  await sfQuery("SELECT Name FROM Patient__c");
  console.log("UNEXPECTED: hospital data visible");
} catch (err) {
  if (err instanceof SalesforceError) console.log("Hospital blocked as expected:", err.errorCode);
  else throw err;
}