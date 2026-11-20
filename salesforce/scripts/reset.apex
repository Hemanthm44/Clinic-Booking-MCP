// Clinic booking demo: wipe Clinic_* records and reseed relative to today (UK time).
// Run: sf apex run --file salesforce/scripts/reset.apex --target-org demo-org
// One transaction: any error rolls everything back. Touches Clinic_* objects only.

Datetime ukToUtc(Date d, Integer h, Integer m) {
    Datetime naive = Datetime.newInstanceGmt(d, Time.newInstance(h, m, 0, 0));
    Integer offsetMs = TimeZone.getTimeZone('Europe/London').getOffset(naive);
    return naive.addSeconds(-offsetMs / 1000);
}

String weekday(Date d) {
    return Datetime.newInstanceGmt(d, Time.newInstance(12, 0, 0, 0)).formatGmt('EEE');
}

String isoDate(Date d) {
    return Datetime.newInstanceGmt(d, Time.newInstance(0, 0, 0, 0)).formatGmt('yyyy-MM-dd');
}

Date nthWorkingDay(Date fromDay, String workingDays, Integer n) {
    Set<String> days = new Set<String>(workingDays.split(';'));
    Integer found = 0;
    for (Integer i = 1; i <= 30; i++) {
        Date d = fromDay.addDays(i);
        if (days.contains(weekday(d))) {
            found++;
            if (found == n) {
                return d;
            }
        }
    }
    return null;
}

String slotKey(Id ownerId, Datetime startUtc) {
    return String.valueOf(ownerId) + '|' + startUtc.formatGmt('yyyy-MM-dd\'T\'HH:mm\'Z\'');
}

Clinic_Patient__c patient(String name, String phone, Date dob) {
    return new Clinic_Patient__c(Name = name, Phone__c = phone, Date_of_Birth__c = dob, Patient_Key__c = phone + '|' + isoDate(dob));
}

Clinic_Appointment__c appt(Clinic_Doctor__c doc, Clinic_Patient__c pat, Date d, Integer h, Integer m, String reason) {
    Datetime s = ukToUtc(d, h, m);
    return new Clinic_Appointment__c(
        Doctor__c = doc.Id,
        Patient__c = pat.Id,
        Start_Time__c = s,
        End_Time__c = s.addMinutes(30),
        Status__c = 'Booked',
        Appointment_Type__c = 'Standard',
        Reason__c = reason,
        Slot_Key__c = slotKey(doc.Id, s),
        Patient_Slot_Key__c = slotKey(pat.Id, s)
    );
}

delete [SELECT Id FROM Clinic_Appointment__c];
delete [SELECT Id FROM Clinic_Leave__c];
delete [SELECT Id FROM Clinic_Patient__c];
delete [SELECT Id FROM Clinic_Doctor__c];

Date todayUk = Date.valueOf(Datetime.now().format('yyyy-MM-dd', 'Europe/London'));

Clinic_Doctor__c patel = new Clinic_Doctor__c(Name = 'Dr Sarah Patel', Working_Days__c = 'Mon;Tue;Wed;Thu;Fri');
Clinic_Doctor__c wilson = new Clinic_Doctor__c(Name = 'Dr James Wilson', Working_Days__c = 'Mon;Tue;Thu;Fri');
Clinic_Doctor__c chen = new Clinic_Doctor__c(Name = 'Dr Emily Chen', Working_Days__c = 'Mon;Wed;Thu;Fri');
insert new List<Clinic_Doctor__c>{ patel, wilson, chen };

Date wilsonLeave = nthWorkingDay(todayUk, wilson.Working_Days__c, 3);
insert new Clinic_Leave__c(Doctor__c = wilson.Id, Start_Date__c = wilsonLeave, End_Date__c = wilsonLeave, Reason__c = 'Annual leave');

Clinic_Patient__c priya = patient('Priya Shah', '+447700900123', Date.newInstance(1988, 4, 12));
Clinic_Patient__c george = patient('George Evans', '+447700900124', Date.newInstance(1975, 9, 3));
Clinic_Patient__c fatima = patient('Fatima Khan', '+447700900125', Date.newInstance(1992, 1, 22));
Clinic_Patient__c liam = patient('Liam Doyle', '+447700900126', Date.newInstance(1960, 6, 30));
Clinic_Patient__c hannah = patient('Hannah Price', '+447700900127', Date.newInstance(2001, 11, 8));
Clinic_Patient__c arjun = patient('Arjun Mehta', '+447700900128', Date.newInstance(1983, 3, 17));
insert new List<Clinic_Patient__c>{ priya, george, fatima, liam, hannah, arjun };

Date patelD1 = nthWorkingDay(todayUk, patel.Working_Days__c, 1);
Date patelD2 = nthWorkingDay(todayUk, patel.Working_Days__c, 2);
Date wilsonD1 = nthWorkingDay(todayUk, wilson.Working_Days__c, 1);
Date wilsonD2 = nthWorkingDay(todayUk, wilson.Working_Days__c, 2);
Date chenD1 = nthWorkingDay(todayUk, chen.Working_Days__c, 1);
Date chenD2 = nthWorkingDay(todayUk, chen.Working_Days__c, 2);

insert new List<Clinic_Appointment__c>{
    appt(patel, george, patelD1, 9, 0, 'Persistent cough'),
    appt(patel, fatima, patelD1, 9, 30, 'Back pain'),
    appt(patel, liam, patelD1, 10, 0, 'Blood pressure check'),
    appt(patel, hannah, patelD1, 10, 30, 'Skin rash'),
    appt(patel, arjun, patelD1, 11, 0, 'Headaches'),
    appt(patel, liam, patelD2, 14, 0, 'Blood test results'),
    appt(wilson, fatima, wilsonD1, 14, 0, 'Follow-up'),
    appt(wilson, hannah, wilsonD1, 14, 30, 'Sore throat'),
    appt(wilson, priya, wilsonD2, 10, 30, 'Medication review'),
    appt(chen, arjun, chenD1, 9, 30, 'Knee pain'),
    appt(chen, george, chenD1, 14, 0, 'Asthma review'),
    appt(chen, hannah, chenD2, 10, 0, 'Travel vaccinations')
};

System.debug('CLINIC RESET OK | today ' + isoDate(todayUk) + ' ' + weekday(todayUk)
    + ' | Patel nearly full ' + isoDate(patelD1) + ' ' + weekday(patelD1)
    + ' | Wilson leave ' + isoDate(wilsonLeave) + ' ' + weekday(wilsonLeave)
    + ' | Priya booked ' + isoDate(wilsonD2) + ' 10:30 with Wilson');