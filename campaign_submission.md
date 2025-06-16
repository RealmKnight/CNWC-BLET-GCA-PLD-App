# A2P 10DLC Campaign Submission - Customer Care Use Case

## Campaign Information

**Campaign Type:** Customer Care  
**Use Case:** Customer Care  
**Vertical:** Labor Union  
**Organization:** Brotherhood of Locomotive Engineers and Trainmen (BLET) WC GCA

## Campaign Description

This campaign sends users notifications from the BLET WC GCA PLD application that they have selected to receive via text message. The application serves union members for managing Personal Leave Days (PLD) and Single Day Vacation (SDV) requests, division communications, meeting notifications, and other important union-related communications. Users explicitly opt-in to receive SMS notifications through the application's notification preference settings and can opt-out at any time by replying STOP or changing their preferences in the app.

## Sample Messages (1-5)

### 1. Request Status Notification

```
PLD Request Approved - March 15, 2024
Your Personal Leave Day request for March 15, 2024 has been APPROVED.
Request ID: REQ-2024-0315-001
```

### 2. Meeting Reminder

```
Meeting Reminder - Division 123
Meeting in one hour: Division meeting at Union Hall on March 20, 2024 at 7:00 PM EST
```

### 3. Admin Message Notification

```
Admin Message
Important: New safety protocols effective immediately. Please review the updated guidelines in the app.
```

### 4. Waitlist Position Update

```
Waitlist Update
Your PLD request for April 10, 2024 has moved up to position #2 on the waitlist.
Request ID: REQ-2024-0410-005
```

### 5. System Alert

```
System Alert
Your division administrator has updated meeting schedules. Please check the app for the latest information.
```

## How End-Users Consent to Receive Messages

End-users provide explicit opt-in consent through BLET WC GCA PLD mobile application:

Opt-In Process:

1. Access: Users select "Text Message" notification preference in profile settings
2. Compliant Modal: SMS opt-in modal with required elements:
   Phone Number Collection:
   - Input field with real-time validation for 10-digit US numbers
   - Required field indicator
     Explicit Opt-In Language:
   - Checkbox: "I agree to receive transactional/informational SMS messages at the phone number provided from Brotherhood of Locomotive Engineers and Trainmen (BLET) WC GCA. Message and data rates may apply. Reply STOP to opt-out."
   - Business name highlighted in app brand color
     See Sample of Modal in Opt-In Section of Privacy policy
     <https://cnwc-gca-pld-app--test.expo.app/privacy>
     Compliance Information:
   - "Consent is not a condition of purchase"
   - "Message frequency varies. Message & data rates may apply. Reply HELP for help or STOP to cancel"
   - Notification types: PLD/SDV status updates, meeting reminders, union communications, admin alerts
3. Terms Acceptance: Required checkbox for Terms of Service and Privacy Policy
4. Validation: All required fields must be completed before submission
5. Confirmation: Success message with opt-out instructions

Ongoing Management:

- Users can change preferences anytime through app settings
- Every SMS includes opt-out instructions (reply STOP)
- Privacy policy explains SMS practices
- Full user control over notification preferences

Compliance Features:

- Phone number collection on opt-in form
- Explicit opt-in language prominently displayed
- Full business name in opt-in language
- "Message and data rates may apply" disclosure
- "Reply STOP to opt-out" instructions
- No hidden terms - all language visible on form
- Transactional/informational messages only
- No marketing content
- Multiple opt-out methods
- Transparent Twilio disclosure

Technical Implementation:

- Form validation prevents submission without consents
- Real-time phone number formatting and validation

This process ensures full TCPA and A2P 10DLC compliance, providing clear user control while meeting all carrier and regulatory requirements.

## Additional Information

**Business Website**: <https://bletcnwcgca.org>  
**Privacy Policy URL**: <https://bletcnwcgca.org/privacy>  
**Direct Opt-In URL**: Available within authenticated mobile application (not publicly accessible due to member authentication requirements)

**Message Frequency:** Varies based on union activity, typically 5-10 messages per month, but may be more frequent during busy periods or important events.

**Opt-Out Method:** Users can opt-out by replying STOP to any message or by changing their contact preference in the mobile application.

**Content Type:** All messages are transactional/informational notifications related to union business activities, request status updates, meeting reminders, and administrative communications.

**Target Audience:** Active union members of the Brotherhood of Locomotive Engineers and Trainmen (BLET) WC GCA who have authenticated accounts in the mobile application.

**SMS Service Provider:** Twilio

**Opt-In Flow Screenshots:** [Screenshots of the complete opt-in flow will be provided via secure document sharing link]
