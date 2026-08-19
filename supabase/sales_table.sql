CREATE TABLE IF NOT EXISTS public.sales (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    customer_name text NOT NULL,
    amount_paid numeric(10, 2) NOT NULL,
    payment_status text NOT NULL DEFAULT 'Paid',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.sales;

CREATE OR REPLACE FUNCTION public.sync_order_to_sales()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_status = 'Received' AND (OLD.order_status IS NULL OR OLD.order_status != 'Received') THEN
        INSERT INTO public.sales (order_id, customer_name, amount_paid, payment_status, created_at)
        VALUES (NEW.id, NEW.customer_name, NEW.total_amount, 'Paid', NEW.created_at);
    ELSIF NEW.order_status != 'Received' AND OLD.order_status = 'Received' THEN
        DELETE FROM public.sales WHERE order_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_order_status_update
    AFTER UPDATE OF order_status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_to_sales();
