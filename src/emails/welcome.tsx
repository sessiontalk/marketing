import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Text,
  Link,
  Img,
  Hr,
  Button,
} from "@react-email/components";

interface WelcomeEmailProps {
  firstname?: string;
  unsubscribeUrl?: string;
}

export default function WelcomeEmail({
  firstname = "there",
  unsubscribeUrl = "{{unsubscribe_url}}",
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to SessionTalk — let's get you started</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Img
              src="https://sessiontalk.co.uk/logo.png"
              width="150"
              alt="SessionTalk"
              style={logo}
            />
          </Section>

          <Section style={content}>
            <Text style={heading}>Welcome, {firstname}! 👋</Text>

            <Text style={paragraph}>
              Thanks for signing up for SessionTalk. You're one step closer to
              giving your customers a world-class softphone experience.
            </Text>

            <Text style={paragraph}>
              Here's what you can do right now:
            </Text>

            <Text style={listItem}>📱 Customise your branded mobile app</Text>
            <Text style={listItem}>🖥️ Set up your desktop softphone</Text>
            <Text style={listItem}>📞 Connect your SIP infrastructure</Text>

            <Section style={buttonContainer}>
              <Button
                href="https://cloud.sessiontalk.co.uk"
                style={button}
              >
                Get Started →
              </Button>
            </Section>

            <Text style={paragraph}>
              If you have any questions, just reply to this email — we're here
              to help.
            </Text>

            <Text style={paragraph}>
              Cheers,
              <br />
              The SessionTalk Team
            </Text>
          </Section>

          <Hr style={hr} />

          <Section style={footer}>
            <Text style={footerText}>
              SessionTalk Ltd · Whitelabel Softphone Solutions
            </Text>
            <Link href={unsubscribeUrl} style={unsubscribeLink}>
              Unsubscribe
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 0",
  maxWidth: "560px",
};

const header = {
  padding: "20px",
  textAlign: "center" as const,
};

const logo = {
  margin: "0 auto",
};

const content = {
  backgroundColor: "#ffffff",
  padding: "40px",
  borderRadius: "8px",
};

const heading = {
  fontSize: "24px",
  fontWeight: "bold" as const,
  color: "#1a1a1a",
  margin: "0 0 20px",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "1.6",
  color: "#404040",
  margin: "0 0 16px",
};

const listItem = {
  fontSize: "16px",
  lineHeight: "1.8",
  color: "#404040",
  margin: "0 0 4px",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#2563eb",
  color: "#ffffff",
  padding: "14px 28px",
  borderRadius: "6px",
  textDecoration: "none",
  fontWeight: "bold" as const,
  fontSize: "16px",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "20px 0",
};

const footer = {
  textAlign: "center" as const,
  padding: "0 20px",
};

const footerText = {
  fontSize: "12px",
  color: "#9ca3af",
  margin: "0 0 8px",
};

const unsubscribeLink = {
  fontSize: "12px",
  color: "#9ca3af",
  textDecoration: "underline",
};
