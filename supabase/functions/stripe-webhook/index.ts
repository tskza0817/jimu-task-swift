// Stripe の checkout.session.completed を受けて purchases に記録する Edge Function。
// 必要なシークレット: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
// （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY は Supabase が自動で提供）
// デプロイ: supabase functions deploy stripe-webhook --no-verify-jwt
import Stripe from "npm:stripe@17";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Payment Link ID（Stripe ダッシュボードの plink_...）→ ツールID
const TOOL_BY_PAYMENT_LINK: Record<string, string> = {
  // "plink_xxxxxxxx": "merge",
};

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await req.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    const toolId = TOOL_BY_PAYMENT_LINK[session.payment_link as string];
    if (session.payment_status === "paid" && userId && toolId) {
      const { error } = await admin.from("purchases").upsert(
        { user_id: userId, tool_id: toolId, stripe_session_id: session.id },
        { onConflict: "user_id,tool_id" },
      );
      if (error) return new Response(error.message, { status: 500 });
    }
  }
  return new Response("ok");
});
