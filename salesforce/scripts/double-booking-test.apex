// Proves the slot guard: a second booking on a taken slot fails; after a proper cancel it succeeds.
// Rolls back at the end, so seeded data is unchanged.
// Run: sf apex run --file salesforce/scripts/double-booking-test.apex --target-org demo-org

Savepoint sp = Database.setSavepoint();

Clinic_Appointment__c existing = [
    SELECT Id, Doctor__c, Start_Time__c, End_Time__c, Slot_Key__c
    FROM Clinic_Appointment__c
    WHERE Status__c = 'Booked'
    ORDER BY Start_Time__c
    LIMIT 1
];
Clinic_Patient__c priya = [SELECT Id FROM Clinic_Patient__c WHERE Name = 'Priya Shah' LIMIT 1];

Clinic_Appointment__c clash = new Clinic_Appointment__c(
    Doctor__c = existing.Doctor__c,
    Patient__c = priya.Id,
    Start_Time__c = existing.Start_Time__c,
    End_Time__c = existing.End_Time__c,
    Status__c = 'Booked',
    Appointment_Type__c = 'Standard',
    Slot_Key__c = existing.Slot_Key__c,
    Patient_Slot_Key__c = String.valueOf(priya.Id) + '|test'
);

Database.SaveResult first = Database.insert(clash.clone(false), false);
String firstResult = first.isSuccess()
    ? 'SUCCEEDED (guard is broken)'
    : String.valueOf(first.getErrors()[0].getStatusCode()) + ' (blocked, as it should be)';
System.debug('TEST 1 double booking: ' + firstResult);

existing.Status__c = 'Cancelled';
existing.Slot_Key__c = null;
existing.Patient_Slot_Key__c = null;
update existing;

Database.SaveResult second = Database.insert(clash.clone(false), false);
String secondResult = second.isSuccess()
    ? 'SUCCEEDED (slot freed, as it should be)'
    : String.valueOf(second.getErrors()[0].getStatusCode()) + ' (cancel did not free the slot)';
System.debug('TEST 2 rebook after cancel: ' + secondResult);

Database.rollback(sp);
System.debug('TEST DONE: rolled back');