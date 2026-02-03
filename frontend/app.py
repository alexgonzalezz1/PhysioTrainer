import streamlit as st
import requests
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from datetime import datetime, timedelta
from typing import Optional

# Configuration
API_BASE_URL = "http://localhost:8000/api/v1"

st.set_page_config(
    page_title="PhysioTrainer - Asistente de Rehabilitación",
    page_icon="💪",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom CSS
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: bold;
        color: #1E88E5;
        margin-bottom: 1rem;
    }
    .metric-card {
        background-color: #f0f2f6;
        border-radius: 10px;
        padding: 20px;
        margin: 10px 0;
    }
    .success-message {
        padding: 1rem;
        border-radius: 0.5rem;
        background-color: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
    }
    .warning-message {
        padding: 1rem;
        border-radius: 0.5rem;
        background-color: #fff3cd;
        border: 1px solid #ffeeba;
        color: #856404;
    }
    .danger-message {
        padding: 1rem;
        border-radius: 0.5rem;
        background-color: #f8d7da;
        border: 1px solid #f5c6cb;
        color: #721c24;
    }
    .chat-message {
        padding: 1rem;
        border-radius: 0.5rem;
        margin: 0.5rem 0;
    }
    .user-message {
        background-color: #e3f2fd;
        text-align: right;
    }
    .assistant-message {
        background-color: #f5f5f5;
    }
</style>
""", unsafe_allow_html=True)


def api_request(endpoint: str, method: str = "GET", data: dict = None) -> Optional[dict]:
    """Make API request and handle errors."""
    try:
        url = f"{API_BASE_URL}{endpoint}"
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method == "PATCH":
            response = requests.patch(url, json=data, timeout=30)
        
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        st.error("⚠️ No se puede conectar con el servidor. Asegúrate de que la API está corriendo.")
        return None
    except requests.exceptions.HTTPError as e:
        st.error(f"Error en la petición: {e}")
        return None
    except Exception as e:
        st.error(f"Error inesperado: {e}")
        return None


def render_sidebar():
    """Render sidebar navigation."""
    st.sidebar.markdown("## 💪 PhysioTrainer")
    st.sidebar.markdown("---")
    
    page = st.sidebar.radio(
        "Navegación",
        ["🏠 Dashboard", "💬 Chat", "📊 Tendencias", "📝 Registros", "⚙️ Ejercicios"],
        label_visibility="collapsed"
    )
    
    st.sidebar.markdown("---")
    st.sidebar.markdown("### 📌 Recordatorios")
    
    # Fetch pending pain updates
    pendientes = api_request("/registros/pendientes")
    if pendientes and len(pendientes) > 0:
        st.sidebar.warning(f"🔔 {len(pendientes)} registro(s) pendiente(s) de actualizar dolor 24h")
    else:
        st.sidebar.success("✅ No hay actualizaciones pendientes")
    
    return page


def render_dashboard():
    """Render main dashboard page."""
    st.markdown('<p class="main-header">📊 Dashboard de Rehabilitación</p>', unsafe_allow_html=True)
    
    # Get statistics
    stats = api_request("/informes/estadisticas")
    
    if stats:
        col1, col2, col3, col4 = st.columns(4)
        
        with col1:
            st.metric(
                label="Total Registros",
                value=stats.get("total_registros", 0)
            )
        
        with col2:
            st.metric(
                label="Pendientes 24h",
                value=stats.get("pendientes_dolor_24h", 0),
                delta="Requieren atención" if stats.get("pendientes_dolor_24h", 0) > 0 else None,
                delta_color="inverse"
            )
        
        with col3:
            st.metric(
                label="Dolor Promedio",
                value=f"{stats.get('promedio_dolor_intra', 0):.1f}/10"
            )
        
        with col4:
            ultimo = stats.get("ultimo_registro")
            if ultimo:
                fecha = datetime.fromisoformat(ultimo.replace("Z", "+00:00"))
                st.metric(
                    label="Último Registro",
                    value=fecha.strftime("%d/%m/%Y")
                )
    
    st.markdown("---")
    
    # Pending pain updates section
    st.subheader("⏰ Actualizar Dolor 24h")
    pendientes = api_request("/registros/pendientes")
    
    if pendientes and len(pendientes) > 0:
        for registro in pendientes[:5]:  # Show max 5
            with st.expander(f"📝 {registro['ejercicio_nombre']} - {registro['fecha'][:10]}"):
                st.write(f"**Series × Reps × Peso:** {registro['series']}×{registro['reps']} @ {registro['peso']}kg")
                st.write(f"**Dolor durante ejercicio:** {registro['dolor_intra']}/10")
                
                dolor_24h = st.slider(
                    "Dolor 24 horas después:",
                    0, 10, 0,
                    key=f"dolor_{registro['id']}"
                )
                
                if st.button("Guardar", key=f"btn_{registro['id']}"):
                    result = api_request(
                        f"/registros/{registro['id']}/dolor-24h",
                        method="PATCH",
                        data={"dolor_24h": dolor_24h}
                    )
                    if result:
                        st.success("✅ Actualizado correctamente")
                        st.rerun()
    else:
        st.info("✅ No hay registros pendientes de actualizar")
    
    st.markdown("---")
    
    # Recent registros
    st.subheader("📋 Últimos Registros")
    registros = api_request("/registros/?limit=10")
    
    if registros:
        df = pd.DataFrame(registros)
        if not df.empty:
            df['fecha'] = pd.to_datetime(df['fecha']).dt.strftime('%d/%m/%Y %H:%M')
            
            st.dataframe(
                df[['fecha', 'ejercicio_nombre', 'series', 'reps', 'peso', 'dolor_intra', 'dolor_24h', 'volumen_total']],
                use_container_width=True,
                hide_index=True
            )


def render_chat():
    """Render chat interface."""
    st.markdown('<p class="main-header">💬 Asistente de Rehabilitación</p>', unsafe_allow_html=True)
    
    st.markdown("""
    Escribe tu sesión de entrenamiento en lenguaje natural. Por ejemplo:
    - "Hoy búlgaras 3x10 con 12kg, dolor 2"
    - "Sentadilla goblet 4x8 con 16kg dolor 3"
    - "Press militar 3x12 con 8kg, algo de molestia dolor 4"
    """)
    
    # Initialize chat history
    if "messages" not in st.session_state:
        st.session_state.messages = []
    
    # Display chat history
    for message in st.session_state.messages:
        with st.chat_message(message["role"]):
            st.markdown(message["content"])
    
    # Chat input
    if prompt := st.chat_input("Describe tu sesión de entrenamiento..."):
        # Add user message
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Get AI response
        with st.chat_message("assistant"):
            with st.spinner("Procesando..."):
                response = api_request("/chat/", method="POST", data={"mensaje": prompt})
                
                if response:
                    message = response.get("mensaje", "")
                    st.markdown(message)
                    
                    if response.get("recomendacion"):
                        st.markdown("---")
                        st.markdown(f"**💡 Recomendación:** {response['recomendacion']}")
                    
                    if response.get("datos_extraidos"):
                        datos = response["datos_extraidos"]
                        st.markdown("---")
                        st.markdown("**📊 Datos registrados:**")
                        col1, col2, col3 = st.columns(3)
                        col1.metric("Ejercicio", datos.get("ejercicio"))
                        col2.metric("Series × Reps", f"{datos.get('series')}×{datos.get('reps')}")
                        col3.metric("Peso", f"{datos.get('peso')}kg")
                    
                    # Save to history
                    full_response = message
                    if response.get("recomendacion"):
                        full_response += f"\n\n💡 **Recomendación:** {response['recomendacion']}"
                    st.session_state.messages.append({"role": "assistant", "content": full_response})
                else:
                    st.error("No se pudo procesar tu mensaje. Inténtalo de nuevo.")


def render_tendencias():
    """Render trends/charts page."""
    st.markdown('<p class="main-header">📈 Tendencias y Progreso</p>', unsafe_allow_html=True)
    
    # Get ejercicios for selector
    ejercicios = api_request("/ejercicios/")
    
    if not ejercicios:
        st.info("No hay ejercicios registrados aún. Comienza a registrar tus sesiones en el Chat.")
        return
    
    # Exercise selector
    ejercicio_nombres = {e["nombre"]: e["id"] for e in ejercicios}
    selected_nombre = st.selectbox("Selecciona un ejercicio:", list(ejercicio_nombres.keys()))
    selected_id = ejercicio_nombres[selected_nombre]
    
    # Get trend data
    tendencias = api_request(f"/informes/tendencias/{selected_id}")
    
    if not tendencias or len(tendencias) == 0:
        st.info("No hay datos suficientes para mostrar tendencias de este ejercicio.")
        return
    
    # Convert to DataFrame
    df = pd.DataFrame(tendencias)
    df['fecha'] = pd.to_datetime(df['fecha'])
    
    # Create dual-axis chart
    fig = go.Figure()
    
    # Volume bars
    fig.add_trace(go.Bar(
        x=df['fecha'],
        y=df['volumen_total'],
        name='Volumen Total (kg)',
        marker_color='#1E88E5',
        opacity=0.7,
        yaxis='y'
    ))
    
    # Pain line (intra)
    fig.add_trace(go.Scatter(
        x=df['fecha'],
        y=df['dolor_intra'],
        name='Dolor Intra-ejercicio',
        line=dict(color='#FF5722', width=3),
        mode='lines+markers',
        yaxis='y2'
    ))
    
    # Pain line (24h) if available
    if df['dolor_24h'].notna().any():
        fig.add_trace(go.Scatter(
            x=df['fecha'],
            y=df['dolor_24h'],
            name='Dolor 24h',
            line=dict(color='#FFC107', width=2, dash='dash'),
            mode='lines+markers',
            yaxis='y2'
        ))
    
    # Layout with dual y-axes
    fig.update_layout(
        title=f'Progreso: {selected_nombre}',
        xaxis=dict(title='Fecha'),
        yaxis=dict(
            title='Volumen Total (kg)',
            titlefont=dict(color='#1E88E5'),
            tickfont=dict(color='#1E88E5'),
            side='left'
        ),
        yaxis2=dict(
            title='Nivel de Dolor (0-10)',
            titlefont=dict(color='#FF5722'),
            tickfont=dict(color='#FF5722'),
            overlaying='y',
            side='right',
            range=[0, 10]
        ),
        legend=dict(
            orientation="h",
            yanchor="bottom",
            y=1.02,
            xanchor="right",
            x=1
        ),
        height=500
    )
    
    st.plotly_chart(fig, use_container_width=True)
    
    # Statistics cards
    st.markdown("---")
    st.subheader("📊 Estadísticas")
    
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        st.metric(
            "Total Sesiones",
            len(df)
        )
    
    with col2:
        st.metric(
            "Volumen Máximo",
            f"{df['volumen_total'].max():.1f} kg"
        )
    
    with col3:
        st.metric(
            "Dolor Promedio",
            f"{df['dolor_intra'].mean():.1f}/10"
        )
    
    with col4:
        # Trend indicator
        if len(df) >= 5:
            recent = df['dolor_intra'].head(3).mean()
            older = df['dolor_intra'].tail(3).mean()
            trend = "↓ Mejorando" if recent < older else "↑ Atención"
            st.metric("Tendencia", trend)
        else:
            st.metric("Tendencia", "N/A")
    
    # Monthly report section
    st.markdown("---")
    st.subheader("📝 Informe Mensual")
    
    col1, col2 = st.columns(2)
    with col1:
        year = st.selectbox("Año:", list(range(2024, 2027)), index=2)
    with col2:
        month = st.selectbox("Mes:", list(range(1, 13)), format_func=lambda x: datetime(2000, x, 1).strftime('%B'))
    
    if st.button("Generar Informe"):
        with st.spinner("Generando informe con IA..."):
            informe = api_request(f"/informes/mensual/{year}/{month}")
            
            if informe:
                st.markdown(f"### Informe {informe['periodo']}")
                st.markdown(f"**Ejercicios analizados:** {informe['ejercicios_analizados']}")
                st.markdown(f"**Total sesiones:** {informe['total_sesiones']}")
                st.markdown("---")
                st.markdown(informe['resumen'])


def render_registros():
    """Render registros management page."""
    st.markdown('<p class="main-header">📝 Gestión de Registros</p>', unsafe_allow_html=True)
    
    # Manual registro form
    st.subheader("➕ Nuevo Registro Manual")
    
    with st.form("nuevo_registro"):
        col1, col2 = st.columns(2)
        
        with col1:
            ejercicio = st.text_input("Nombre del ejercicio *")
            series = st.number_input("Series *", min_value=1, value=3)
            reps = st.number_input("Repeticiones *", min_value=1, value=10)
        
        with col2:
            peso = st.number_input("Peso (kg) *", min_value=0.0, value=10.0, step=0.5)
            dolor = st.slider("Dolor durante ejercicio (0-10) *", 0, 10, 0)
            notas = st.text_area("Notas (opcional)")
        
        submitted = st.form_submit_button("Guardar Registro")
        
        if submitted:
            if not ejercicio:
                st.error("El nombre del ejercicio es obligatorio")
            else:
                data = {
                    "ejercicio_nombre": ejercicio,
                    "series": series,
                    "reps": reps,
                    "peso": peso,
                    "dolor_intra": dolor,
                    "notas": notas if notas else None
                }
                result = api_request("/registros/", method="POST", data=data)
                if result:
                    st.success(f"✅ Registro guardado: {ejercicio} {series}×{reps} @ {peso}kg")
                    st.rerun()
    
    st.markdown("---")
    
    # List all registros
    st.subheader("📋 Historial de Registros")
    
    registros = api_request("/registros/?limit=50")
    
    if registros:
        df = pd.DataFrame(registros)
        if not df.empty:
            df['fecha'] = pd.to_datetime(df['fecha']).dt.strftime('%d/%m/%Y %H:%M')
            
            # Color code pain levels
            def color_dolor(val):
                if val is None:
                    return ''
                elif val <= 3:
                    return 'background-color: #c8e6c9'  # Green
                elif val <= 5:
                    return 'background-color: #fff9c4'  # Yellow
                else:
                    return 'background-color: #ffcdd2'  # Red
            
            styled_df = df[['fecha', 'ejercicio_nombre', 'series', 'reps', 'peso', 'dolor_intra', 'dolor_24h', 'volumen_total']].style.applymap(
                color_dolor, subset=['dolor_intra', 'dolor_24h']
            )
            
            st.dataframe(styled_df, use_container_width=True, hide_index=True)
    else:
        st.info("No hay registros aún. ¡Comienza a registrar tus sesiones!")


def render_ejercicios():
    """Render ejercicios management page."""
    st.markdown('<p class="main-header">⚙️ Gestión de Ejercicios</p>', unsafe_allow_html=True)
    
    # New ejercicio form
    st.subheader("➕ Nuevo Ejercicio")
    
    with st.form("nuevo_ejercicio"):
        col1, col2, col3 = st.columns(3)
        
        with col1:
            nombre = st.text_input("Nombre del ejercicio *")
        with col2:
            categoria = st.selectbox(
                "Categoría",
                ["Fuerza", "Movilidad", "Estabilidad", "Cardio", "Flexibilidad", "General"]
            )
        with col3:
            umbral = st.slider("Umbral dolor máximo", 0, 10, 4)
        
        submitted = st.form_submit_button("Crear Ejercicio")
        
        if submitted:
            if not nombre:
                st.error("El nombre es obligatorio")
            else:
                data = {
                    "nombre": nombre,
                    "categoria": categoria,
                    "umbral_dolor_max": umbral
                }
                result = api_request("/ejercicios/", method="POST", data=data)
                if result:
                    st.success(f"✅ Ejercicio '{nombre}' creado correctamente")
                    st.rerun()
    
    st.markdown("---")
    
    # List all ejercicios
    st.subheader("📋 Lista de Ejercicios")
    
    ejercicios = api_request("/ejercicios/")
    
    if ejercicios:
        df = pd.DataFrame(ejercicios)
        if not df.empty:
            df['created_at'] = pd.to_datetime(df['created_at']).dt.strftime('%d/%m/%Y')
            
            st.dataframe(
                df[['nombre', 'categoria', 'umbral_dolor_max', 'created_at']],
                use_container_width=True,
                hide_index=True,
                column_config={
                    "nombre": "Ejercicio",
                    "categoria": "Categoría", 
                    "umbral_dolor_max": "Umbral Dolor",
                    "created_at": "Fecha Creación"
                }
            )
    else:
        st.info("No hay ejercicios registrados. Se crearán automáticamente al usar el chat.")


def main():
    """Main application entry point."""
    page = render_sidebar()
    
    if page == "🏠 Dashboard":
        render_dashboard()
    elif page == "💬 Chat":
        render_chat()
    elif page == "📊 Tendencias":
        render_tendencias()
    elif page == "📝 Registros":
        render_registros()
    elif page == "⚙️ Ejercicios":
        render_ejercicios()


if __name__ == "__main__":
    main()
